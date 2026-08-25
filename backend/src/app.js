import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import {
  createAuthorizationUrl,
  createGoogleAuth,
  getProfile,
  listIsolatedMessages,
  listMessages,
} from './google.js';
import {
  isolateMessage,
  isValidMessageId,
  markIsolatedAsSpam,
  quarantineMessage,
  restoreMessage,
  trashAllIsolatedMessages,
  trashIsolatedMessage,
} from './gmail-actions.js';
import { AIServiceError, analyzeEmailWithAI } from './ai.js';
import { createAIJobManager } from './ai-jobs.js';
import { createAgentScheduler } from './agent-scheduler.js';
import { createEncryptedStore } from './encrypted-store.js';

const OAUTH_COOKIE = 'mailmind_oauth_state';

function apiError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

export function mutationOriginAllowed({ method, origin, frontendUrl, isProduction }) {
  if (!isProduction || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;
  return origin === frontendUrl;
}

export function createApp(config) {
  const app = express();
  const oauthClient = createGoogleAuth(config);
  let connected = false;
  const auditLog = [];
  const aiJobs = createAIJobManager();
  const tokenStore = createEncryptedStore({ filePath: config.tokenStorePath, secret: config.dataEncryptionKey });
  const agentStateStore = createEncryptedStore({ filePath: config.agentStatePath, secret: config.dataEncryptionKey });
  const storedCredentials = tokenStore.load();
  if (storedCredentials?.access_token || storedCredentials?.refresh_token) {
    oauthClient.setCredentials(storedCredentials);
    connected = true;
  }
  const persistTokens = (credentials) => {
    try { tokenStore.save(credentials); }
    catch (error) { console.warn(`Jetons OAuth non persistés : ${error.message}`); }
  };
  const agentScheduler = createAgentScheduler({
    scan: async (maxMessages) => {
      if (!connected || !oauthClient.credentials.access_token) throw new Error('Gmail non connecté');
      return (await listMessages(oauthClient, { maxResults: maxMessages })).messages;
    },
    initialState: agentStateStore.load(),
    onStateChange: (state) => agentStateStore.save(state),
  });

  oauthClient.on('tokens', (tokens) => {
    if (tokens.access_token || tokens.refresh_token) {
      connected = true;
      persistTokens({ ...oauthClient.credentials, ...tokens });
    }
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
  app.use((req, res, next) => {
    if (mutationOriginAllowed({ method: req.method, origin: req.get('origin'), frontendUrl: config.frontendUrl, isProduction: config.isProduction })) return next();
    return apiError(res, 403, 'UNTRUSTED_ORIGIN', 'Origine de la requête refusée.');
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'MailMind API', oauthReady: config.oauthReady, aiReady: config.aiReady, aiProvider: config.aiProvider, persistenceReady: tokenStore.enabled && agentStateStore.enabled });
  });

  const aiStatus = () => ({ configured: config.aiReady, provider: config.aiProvider, model: config.aiModel });
  const deploymentStatus = () => ({ mode: config.isProduction ? 'private' : 'local', persistence: tokenStore.enabled && agentStateStore.enabled });

  app.get('/api/auth/status', async (_req, res) => {
    if (!config.oauthReady) {
      return res.json({
        connected: false,
        configured: false,
        missing: config.missing,
        ai: aiStatus(),
        deployment: deploymentStatus(),
      });
    }

    if (!connected || !oauthClient.credentials.access_token) {
      return res.json({ connected: false, configured: true, ai: aiStatus(), deployment: deploymentStatus() });
    }

    try {
      const profile = await getProfile(oauthClient);
      return res.json({ connected: true, configured: true, accessMode: 'modify', profile, ai: aiStatus(), deployment: deploymentStatus() });
    } catch (error) {
      console.warn(`Profil Gmail momentanément indisponible : ${error.code || error.message}`);
      return res.json({ connected: false, configured: true, ai: aiStatus(), deployment: deploymentStatus() });
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
      secure: config.cookieSecure,
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
      persistTokens(tokens);
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
      agentScheduler.reset();
      try { tokenStore.clear(); } catch (error) { console.warn(`Jetons persistés non effacés : ${error.message}`); }
      try { agentStateStore.clear(); } catch (error) { console.warn(`État agent persistant non effacé : ${error.message}`); }
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

  app.get('/api/isolation', async (req, res) => {
    if (!connected || !oauthClient.credentials.access_token) {
      return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    }
    try {
      return res.json(await listIsolatedMessages(oauthClient, {
        pageToken: req.query.pageToken,
        maxResults: req.query.limit,
      }));
    } catch (error) {
      console.error('Isolation list failed:', error.message);
      return apiError(res, 502, 'ISOLATION_LIST_FAILED', 'Impossible de charger le sas MailMind.');
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
      auditLog.unshift({ action, at: new Date().toISOString() });
      auditLog.splice(100);
      return res.json(result);
    } catch (error) {
      console.error(`Gmail ${action} failed:`, error.message);
      if (error.code === 'NOT_ISOLATED') {
        return apiError(res, 409, 'NOT_ISOLATED', 'Ce message n’est plus présent dans le sas MailMind.');
      }
      if ([401, 403].includes(Number(error.code || error.response?.status))) {
        return apiError(res, 403, 'GMAIL_PERMISSION_REQUIRED', 'Reconnectez Google pour autoriser la gestion réversible des labels.');
      }
      return apiError(res, 502, 'GMAIL_ACTION_FAILED', 'Gmail n’a pas pu appliquer cette action.');
    }
  }

  app.post('/api/emails/:id/quarantine', (req, res) => applyGmailAction(req, res, 'quarantine'));
  app.post('/api/emails/:id/restore', (req, res) => applyGmailAction(req, res, 'restore'));

  async function applyIsolationAction(req, res, action, callback) {
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
      const result = await callback(oauthClient, req.params.id);
      auditLog.unshift({ action, at: new Date().toISOString() });
      auditLog.splice(100);
      return res.json(result);
    } catch (error) {
      console.error(`Isolation ${action} failed:`, error.message);
      if (error.code === 'NOT_ISOLATED') {
        return apiError(res, 409, 'NOT_ISOLATED', 'Ce message n’est plus présent dans le sas MailMind.');
      }
      if ([401, 403].includes(Number(error.code || error.response?.status))) {
        return apiError(res, 403, 'GMAIL_PERMISSION_REQUIRED', 'Reconnectez Google pour autoriser cette action Gmail.');
      }
      return apiError(res, 502, 'ISOLATION_ACTION_FAILED', 'Gmail n’a pas pu appliquer cette action.');
    }
  }

  app.post('/api/emails/:id/isolate', (req, res) => applyIsolationAction(req, res, 'isolate', isolateMessage));
  app.post('/api/isolation/:id/spam', (req, res) => applyIsolationAction(req, res, 'spam', markIsolatedAsSpam));
  app.post('/api/isolation/:id/trash', (req, res) => applyIsolationAction(req, res, 'trash', trashIsolatedMessage));

  app.post('/api/isolation/trash-all', async (req, res) => {
    if (!connected || !oauthClient.credentials.access_token) {
      return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    }
    const expectedCount = Number(req.body?.expectedCount);
    if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 500
      || req.body?.confirmation !== `CORBEILLE ${expectedCount}`
      || req.get('x-mailmind-confirm') !== 'trash-all') {
      return apiError(res, 409, 'CONFIRMATION_REQUIRED', 'Saisissez la confirmation exacte correspondant au nombre de messages.');
    }
    try {
      const result = await trashAllIsolatedMessages(oauthClient, expectedCount);
      auditLog.unshift({ action: 'trash-all', count: result.trashed, failed: result.failed, at: new Date().toISOString() });
      auditLog.splice(100);
      return res.json(result);
    } catch (error) {
      console.error('Isolation trash-all failed:', error.message);
      if (error.code === 'ISOLATION_COUNT_CHANGED') {
        return apiError(res, 409, 'ISOLATION_COUNT_CHANGED', 'Le contenu du sas a changé. Actualisez avant de confirmer.');
      }
      if (error.code === 'ISOLATION_LIMIT_EXCEEDED') {
        return apiError(res, 409, 'ISOLATION_LIMIT_EXCEEDED', error.message);
      }
      return apiError(res, 502, 'ISOLATION_ACTION_FAILED', 'Gmail n’a pas pu vider entièrement le sas.');
    }
  });

  app.get('/api/audit', (_req, res) => {
    if (!connected) return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    return res.json({ events: auditLog });
  });

  app.get('/api/agent/schedule', (_req, res) => {
    if (!connected) return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    return res.json(agentScheduler.status());
  });

  app.put('/api/agent/schedule', (req, res) => {
    if (!connected) return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    if (req.get('x-mailmind-agent-consent') !== 'schedule-simulation') {
      return apiError(res, 409, 'AGENT_CONSENT_REQUIRED', 'Confirmez explicitement la planification de simulations Gmail.');
    }
    return res.json(agentScheduler.configure({ ...req.body, enabled: true }));
  });

  app.delete('/api/agent/schedule', (_req, res) => {
    if (!connected) return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    return res.json(agentScheduler.disable());
  });

  app.post('/api/agent/schedule/run', async (_req, res) => {
    if (!connected) return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    try {
      const report = await agentScheduler.run();
      return report
        ? res.json(report)
        : apiError(res, 409, 'AGENT_ALREADY_RUNNING', 'Une simulation planifiée est déjà en cours.');
    } catch (error) {
      console.error('Scheduled agent run failed:', error.message);
      return apiError(res, 502, 'AGENT_SCHEDULE_FAILED', 'La simulation planifiée n’a pas pu analyser Gmail.');
    }
  });

  app.get('/api/agent/schedule/reports', (_req, res) => {
    if (!connected) return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    return res.json({ reports: agentScheduler.reports() });
  });

  app.post('/api/ai/analyze', async (req, res) => {
    if (!connected || !oauthClient.credentials.access_token) {
      return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    }
    if (!config.aiReady) {
      return apiError(res, 503, 'AI_NOT_CONFIGURED', 'Configurez AI_PROVIDER et les paramètres du fournisseur IA dans backend/.env.');
    }
    if (req.get('x-mailmind-ai-consent') !== 'analyze') {
      return apiError(res, 409, 'AI_CONSENT_REQUIRED', 'Confirmez explicitement l’analyse de ce message.');
    }

    try {
      const analysis = await analyzeEmailWithAI(config, req.body?.email);
      return res.json({ analysis, provider: config.aiProvider, model: config.aiModel });
    } catch (error) {
      if (error instanceof AIServiceError && error.code === 'INVALID_AI_INPUT') {
        return apiError(res, 400, error.code, error.message);
      }
      console.error('AI analysis failed:', error.code || error.message);
      return apiError(res, 502, error.code || 'AI_ERROR', error.message || 'L’analyse IA a échoué.');
    }
  });

  app.post('/api/ai/jobs', (req, res) => {
    if (!connected || !oauthClient.credentials.access_token) {
      return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    }
    if (!config.aiReady) {
      return apiError(res, 503, 'AI_NOT_CONFIGURED', 'Configurez AI_PROVIDER et les paramètres du fournisseur IA dans backend/.env.');
    }
    if (req.get('x-mailmind-ai-consent') !== 'analyze') {
      return apiError(res, 409, 'AI_CONSENT_REQUIRED', 'Confirmez explicitement l’analyse de ce message.');
    }

    try {
      return res.status(202).json(aiJobs.start(config, req.body?.email));
    } catch (error) {
      if (error instanceof AIServiceError && error.code === 'INVALID_AI_INPUT') {
        return apiError(res, 400, error.code, error.message);
      }
      return apiError(res, 429, error.code || 'AI_JOB_ERROR', error.message || 'Impossible de démarrer l’analyse.');
    }
  });

  app.get('/api/ai/jobs/:id', (req, res) => {
    if (!connected || !oauthClient.credentials.access_token) {
      return apiError(res, 401, 'NOT_CONNECTED', 'Connectez d’abord votre compte Gmail.');
    }
    if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) {
      return apiError(res, 400, 'INVALID_AI_JOB_ID', 'Identifiant d’analyse invalide.');
    }
    const job = aiJobs.get(req.params.id);
    return job
      ? res.json(job)
      : apiError(res, 404, 'AI_JOB_NOT_FOUND', 'Cette analyse a expiré ou le backend a été redémarré.');
  });

  app.use((_req, res) => apiError(res, 404, 'NOT_FOUND', 'Route introuvable.'));

  return app;
}
