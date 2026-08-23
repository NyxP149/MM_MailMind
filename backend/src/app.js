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

const OAUTH_COOKIE = 'mailmind_oauth_state';

function apiError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

export function createApp(config) {
  const app = express();
  const oauthClient = createGoogleAuth(config);
  let connected = false;

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
    res.json({ status: 'ok', service: 'MailMind API', oauthReady: config.oauthReady });
  });

  app.get('/api/auth/status', async (_req, res) => {
    if (!config.oauthReady) {
      return res.json({
        connected: false,
        configured: false,
        missing: config.missing,
      });
    }

    if (!connected || !oauthClient.credentials.access_token) {
      return res.json({ connected: false, configured: true });
    }

    try {
      const profile = await getProfile(oauthClient);
      return res.json({ connected: true, configured: true, profile });
    } catch {
      connected = false;
      oauthClient.setCredentials({});
      return res.json({ connected: false, configured: true });
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

  app.use((_req, res) => apiError(res, 404, 'NOT_FOUND', 'Route introuvable.'));

  return app;
}

