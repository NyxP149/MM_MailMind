import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import {
  createAuthorizationUrl,
  createGoogleAuth,
  getProfile,
  listMessages,
} from './google.js';
import { isValidMessageId, quarantineMessage, restoreMessage } from './gmail-actions.js';
import { AIServiceError, analyzeEmailWithAI } from './ai.js';

const OAUTH_COOKIE = 'mailmind_oauth_state';

function apiError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

export function createApp(config) {
  const app = express();
  const oauthClient = createGoogleAuth(config);
  let connected = false;
  const auditLog = [];

  oauthClient.on('tokens', (tokens) => {
    if (tokens.access_token || tokens.refresh_token) connected = true;
  });

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser(config.cookieSecret || 'mailmind-development-only'));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'MailMind API', oauthReady: config.oauthReady, aiReady: config.aiReady });
  });

  app.get('/api/auth/status', async (_req, res) => {
    if (!config.oauthReady) {
      return res.json({
        connected: false,
        configured: false,
        missing: config.missing,
        ai: { configured: config.aiReady, model: config.openaiModel },
      });
    }

    if (!connected || !oauthClient.credentials.access_token) {
      return res.json({ connected: false, configured: true, ai: { configured: config.aiReady, model: config.openaiModel } });
    }

    try {
      const profile = await getProfile(oauthClient);
      return res.json({ connected: true, configured: true, accessMode: 'modify', profile, ai: { configured: config.aiReady, model: config.openaiModel } });
    } catch {
      connected = false;
      oauthClient.setCredentials({});
      return res.json({ connected: false, configured: true, ai: { configured: config.aiReady, model: config.openaiModel } });
    }
  });

  app.get('/api/auth/google', (_req, res) => {
    if (!config.oauthReady) {
      return apiError(
        res,
        503,
        'OAUTH_NOT_CONFIGURED',
        `Configuration OAuth incomplète : ${config.missing.join(', ')}`,
      );
    }

    const state = crypto.randomBytes(32).toString('hex');
    res.cookie(OAUTH_COOKIE, state, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(createAuthorizationUrl(oauthClient, state));
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const expectedState = req.signedCookies[OAUTH_COOKIE];
    res.clearCookie(OAUTH_COOKIE);

    if (!expectedState || req.query.state !== expectedState) {
      return res.redirect(`${config.frontendUrl}/?auth=invalid_state`);
    }
    if (req.query.error) {
      return res.redirect(`${config.frontendUrl}/?auth=denied`);
    }
    if (!req.query.code) {
      return res.redirect(`${config.frontendUrl}/?auth=missing_code`);
    }

    try {
      const { tokens } = await oauthClient.getToken(req.query.code);
      oauthClient.setCredentials(tokens);
      connected = true;
      return res.redirect(`${config.frontendUrl}/?auth=success`);
    } catch (error) {
      console.error('OAuth callback failed:', error.message);
      return res.redirect(`${config.frontendUrl}/?auth=failed`);
    }
  });

  app.post('/api/auth/logout', async (_req, res) => {
    try {
      if (oauthClient.credentials.access_token) {
        await oauthClient.revokeCredentials();
      }
    } catch (error) {
      console.warn('Token revocation failed:', error.message);
    } finally {
      connected = false;
      oauthClient.setCredentials({});
    }
    res.status(204).end();
  });

  app.get('/api/emails', async (req, res) => {
    if (!connected || !oauthClient.credentials.access_token) {
      return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    }

    try {
      const result = await listMessages(oauthClient, {
        pageToken: req.query.pageToken,
        maxResults: req.query.limit,
      });
      return res.json(result);
    } catch (error) {
      console.error('Gmail list failed:', error.message);
      return apiError(res, 502, 'GMAIL_ERROR', 'Impossible de charger les e-mails Gmail.');
    }
  });

  async function applyGmailAction(req, res, action) {
    if (!connected || !oauthClient.credentials.access_token) {
      return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    }
    if (!isValidMessageId(req.params.id)) {
      return apiError(res, 400, 'INVALID_MESSAGE_ID', 'Identifiant Gmail invalide.');
    }
    if (req.get('x-mailmind-confirm') !== action) {
      return apiError(res, 409, 'CONFIRMATION_REQUIRED', 'Une confirmation explicite est requise.');
    }

    try {
      const result = action === 'quarantine'
        ? await quarantineMessage(oauthClient, req.params.id)
        : await restoreMessage(oauthClient, req.params.id);
      auditLog.unshift({ messageId: req.params.id, action, at: new Date().toISOString() });
      auditLog.splice(100);
      return res.json(result);
    } catch (error) {
      console.error(`Gmail ${action} failed:`, error.message);
      if ([401, 403].includes(Number(error.code || error.response?.status))) {
        return apiError(res, 403, 'GMAIL_PERMISSION_REQUIRED', 'Reconnectez Google pour autoriser la gestion réversible des labels.');
      }
      return apiError(res, 502, 'GMAIL_ACTION_FAILED', 'Gmail n’a pas pu appliquer cette action.');
    }
  }

  app.post('/api/emails/:id/quarantine', (req, res) => applyGmailAction(req, res, 'quarantine'));
  app.post('/api/emails/:id/restore', (req, res) => applyGmailAction(req, res, 'restore'));

  app.get('/api/audit', (_req, res) => {
    if (!connected) return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    return res.json({ events: auditLog });
  });

  app.post('/api/ai/analyze', async (req, res) => {
    if (!connected || !oauthClient.credentials.access_token) {
      return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    }
    if (!config.aiReady) {
      return apiError(res, 503, 'AI_NOT_CONFIGURED', 'Ajoutez OPENAI_API_KEY dans backend/.env pour activer l’assistant V5.');
    }
    if (req.get('x-mailmind-ai-consent') !== 'analyze') {
      return apiError(res, 409, 'AI_CONSENT_REQUIRED', 'Confirmez explicitement l’analyse de ce message.');
    }

    try {
      const analysis = await analyzeEmailWithAI(config, req.body?.email);
      return res.json({ analysis, model: config.openaiModel });
    } catch (error) {
      if (error instanceof AIServiceError && error.code === 'INVALID_AI_INPUT') {
        return apiError(res, 400, error.code, error.message);
      }
      console.error('AI analysis failed:', error.code || error.message);
      return apiError(res, 502, error.code || 'AI_ERROR', error.message || 'L’analyse IA a échoué.');
    }
  });

  app.use((_req, res) => apiError(res, 404, 'NOT_FOUND', 'Route introuvable.'));

  return app;
}
