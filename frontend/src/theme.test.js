import { describe, expect, it } from 'vitest';
import { resolveTheme, THEME_KEY } from './theme.js';

describe('thème MailMind', () => {
  it('conserve le thème choisi', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('suit la préférence système lors de la première visite', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('ignore une valeur stockée invalide', () => {
    expect(resolveTheme('sepia', true)).toBe('dark');
    expect(THEME_KEY).toBe('mailmind:theme:v1');
  });
});
