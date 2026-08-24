const requiredKeys = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'COOKIE_SECRET',
];

export function getConfig(env = process.env) {
  const missing = requiredKeys.filter((key) => !env[key]);

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
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL || 'gpt-5.4-nano',
    aiReady: Boolean(env.OPENAI_API_KEY),
  };
}
