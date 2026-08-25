import test from 'node:test';
import assert from 'node:assert/strict';
import { getHeader, normalizeMessage, parseAddress, parseListUnsubscribe } from './google.js';

test('getHeader ignores header name casing', () => {
  assert.equal(getHeader([{ name: 'subject', value: 'Bonjour' }], 'Subject'), 'Bonjour');
});

test('parseAddress separates display name and email', () => {
  assert.deepEqual(parseAddress('Alice Example <alice@example.com>'), {
    name: 'Alice Example',
    email: 'alice@example.com',
  });
});

test('normalizeMessage creates a safe UI payload', () => {
  const result = normalizeMessage({
    id: '42',
    threadId: '24',
    snippet: 'Aperçu du message',
    labelIds: ['INBOX', 'UNREAD'],
    payload: {
      headers: [
        { name: 'From', value: 'Alice <alice@example.com>' },
        { name: 'Subject', value: 'Bienvenue' },
      ],
    },
  });

  assert.equal(result.subject, 'Bienvenue');
  assert.equal(result.unread, true);
  assert.equal(result.from.email, 'alice@example.com');
  assert.equal(result.unsubscribe.available, false);
});

test('parseListUnsubscribe privilégie le one-click HTTPS', () => {
  const result = parseListUnsubscribe([
    { name: 'List-Unsubscribe', value: '<mailto:remove@example.com>, <https://news.example.com/unsubscribe?id=42>' },
    { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
  ]);
  assert.deepEqual(result, {
    available: true,
    method: 'one-click',
    url: 'https://news.example.com/unsubscribe?id=42',
    host: 'news.example.com',
  });
});

test('parseListUnsubscribe refuse les protocoles et ports risqués', () => {
  assert.deepEqual(parseListUnsubscribe([
    { name: 'List-Unsubscribe', value: '<http://example.com/remove>, <https://example.com:8443/remove>, <javascript:alert(1)>' },
  ]), { available: false });
});

test('parseListUnsubscribe accepte un recours mailto explicite', () => {
  const result = parseListUnsubscribe([
    { name: 'List-Unsubscribe', value: '<mailto:unsubscribe@example.com?subject=unsubscribe>' },
  ]);
  assert.equal(result.method, 'email');
  assert.equal(result.address, 'unsubscribe@example.com');
});
