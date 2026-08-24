export const THEME_KEY = 'mailmind:theme:v1';

export function resolveTheme(savedTheme, prefersDark = false) {
  if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
  return prefersDark ? 'dark' : 'light';
}
