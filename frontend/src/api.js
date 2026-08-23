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
  getEmails: (pageToken) =>
    request(`/api/emails?limit=20${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
};

