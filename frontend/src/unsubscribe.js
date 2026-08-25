export function validateUnsubscribe(unsubscribe) {
  if (!unsubscribe?.available || !['one-click', 'web', 'email'].includes(unsubscribe.method)) return null;
  if (typeof unsubscribe.url !== 'string' || !unsubscribe.url || unsubscribe.url.length > 2048) return null;

  try {
    const url = new URL(unsubscribe.url);
    if (unsubscribe.method === 'email') {
      const address = decodeURIComponent(url.pathname);
      if (url.protocol !== 'mailto:' || /[\r\n]/.test(unsubscribe.url) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return null;
      return { ...unsubscribe, url: url.toString() };
    }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    return { ...unsubscribe, url: url.toString(), host: url.hostname };
  } catch {
    return null;
  }
}

export function launchUnsubscribe(unsubscribe, { documentRef = document, windowRef = window } = {}) {
  const target = validateUnsubscribe(unsubscribe);
  if (!target) throw new Error('Le mécanisme de désabonnement fourni par cet expéditeur est invalide.');

  if (target.method === 'one-click') {
    const form = documentRef.createElement('form');
    const input = documentRef.createElement('input');
    form.method = 'POST';
    form.action = target.url;
    form.target = '_blank';
    form.rel = 'noopener noreferrer';
    input.type = 'hidden';
    input.name = 'List-Unsubscribe';
    input.value = 'One-Click';
    form.appendChild(input);
    documentRef.body.appendChild(form);
    form.submit();
    form.remove();
    return 'one-click';
  }

  if (target.method === 'web') {
    windowRef.open(target.url, '_blank', 'noopener,noreferrer');
    return 'web';
  }

  windowRef.location.assign(target.url);
  return 'email';
}
