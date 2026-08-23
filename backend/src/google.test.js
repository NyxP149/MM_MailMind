import test from 'node:test';
import assert from 'node:assert/strict';
import { getHeader, normalizeMessage, parseAddress } from './google.js';

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
});

