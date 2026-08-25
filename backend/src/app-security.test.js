import assert from 'node:assert/strict';
import test from 'node:test';
import { mutationOriginAllowed } from './app.js';

test('les lectures et le développement restent autorisés', () => {
  assert.equal(mutationOriginAllowed({ method: 'GET', isProduction: true }), true);
  assert.equal(mutationOriginAllowed({ method: 'POST', origin: 'https://evil.example', frontendUrl: 'https://mailmind.example', isProduction: false }), true);
});

test('la production exige l’origine exacte pour toute mutation', () => {
  const input = { method: 'POST', frontendUrl: 'https://mailmind.example', isProduction: true };
  assert.equal(mutationOriginAllowed({ ...input, origin: 'https://mailmind.example' }), true);
  assert.equal(mutationOriginAllowed({ ...input, origin: 'https://evil.example' }), false);
  assert.equal(mutationOriginAllowed({ ...input, origin: undefined }), false);
});
