const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || 'Une erreur est survenue.');
  }

  return response.status === 204 ? null : response.json();
}

export const api = {
  authUrl: `${API_URL}/api/auth/google`,
  getStatus: () => request('/api/auth/status'),
  getEmails: (pageToken, limit = 20) =>
    request(`/api/emails?limit=${Math.min(Math.max(Number(limit) || 20, 1), 50)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`),
  quarantineEmail: (id) => request(`/api/emails/${encodeURIComponent(id)}/quarantine`, {
    method: 'POST',
    headers: { 'X-MailMind-Confirm': 'quarantine' },
  }),
  restoreEmail: (id) => request(`/api/emails/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: { 'X-MailMind-Confirm': 'restore' },
  }),
  analyzeEmail: (email) => request('/api/ai/analyze', {
    method: 'POST',
    headers: { 'X-MailMind-AI-Consent': 'analyze' },
    body: JSON.stringify({ email }),
  }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
};
