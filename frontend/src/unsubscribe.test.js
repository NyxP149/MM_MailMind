import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchUnsubscribe, validateUnsubscribe } from './unsubscribe.js';

afterEach(() => vi.restoreAllMocks());

describe('désabonnement V10', () => {
  it('refuse une URL externe non HTTPS', () => {
    expect(validateUnsubscribe({ available: true, method: 'web', url: 'http://example.com/remove' })).toBeNull();
    expect(validateUnsubscribe({ available: true, method: 'email', url: 'mailto:not-an-address' })).toBeNull();
  });

  it('construit un POST one-click standard sans fetch backend', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    expect(launchUnsubscribe({ available: true, method: 'one-click', url: 'https://news.example.com/remove', host: 'news.example.com' })).toBe('one-click');
    expect(submit).toHaveBeenCalledOnce();
    const form = submit.mock.instances[0];
    expect(form.method).toBe('post');
    expect(form.action).toBe('https://news.example.com/remove');
    expect(form.elements.namedItem('List-Unsubscribe').value).toBe('One-Click');
  });

  it('ouvre une page web seulement après validation', () => {
    const open = vi.fn();
    expect(launchUnsubscribe({ available: true, method: 'web', url: 'https://example.com/remove' }, { documentRef: document, windowRef: { open } })).toBe('web');
    expect(open).toHaveBeenCalledWith('https://example.com/remove', '_blank', 'noopener,noreferrer');
  });
});
