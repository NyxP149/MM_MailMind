const requiredKeys = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'COOKIE_SECRET',
];

export function getConfig(env = process.env) {
  const missing = requiredKeys.filter((key) => !env[key]);
  const aiProvider = (env.AI_PROVIDER || 'openai').trim().toLowerCase();
  const openaiModel = env.OPENAI_MODEL || 'gpt-5.4-nano';
  const ollamaModel = env.OLLAMA_MODEL || 'qwen3:4b';
  const aiModel = aiProvider === 'ollama' ? ollamaModel : openaiModel;
  const aiReady = aiProvider === 'ollama'
    ? true
    : aiProvider === 'openai' && Boolean(env.OPENAI_API_KEY);

  return {
    port: Number(env.PORT || 3000),
    frontendUrl: env.FRONTEND_URL || 'http://localhost:5173',
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri:
      env.GOOGLE_REDIRECT_URI ||
      'http://localhost:3000/api/auth/google/callback',
    cookieSecret: env.COOKIE_SECRET,
    oauthReady: missing.length === 0,
    missing,
    isProduction: env.NODE_ENV === 'production',
    aiProvider,
    aiModel,
    aiReady,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel,
    ollamaBaseUrl: (env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    ollamaModel,
    dataEncryptionKey: env.DATA_ENCRYPTION_KEY,
    tokenStorePath: env.TOKEN_STORE_PATH,
    agentStatePath: env.AGENT_STATE_PATH,
    persistenceReady: Boolean(env.DATA_ENCRYPTION_KEY?.length >= 32 && env.TOKEN_STORE_PATH && env.AGENT_STATE_PATH),
  };
}
