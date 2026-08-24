import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureQuarantineLabel, isValidMessageId, QUARANTINE_LABEL } from './gmail-actions.js';

test('accepts Gmail-like message ids and rejects unsafe route values', () => {
  assert.equal(isValidMessageId('18f2abc_DEF-42'), true);
  assert.equal(isValidMessageId('../../messages'), false);
  assert.equal(isValidMessageId(''), false);
});

test('reuses the existing quarantine label', async () => {
  let created = false;
  const gmail = {
    users: { labels: {
      list: async () => ({ data: { labels: [{ id: 'Label_42', name: QUARANTINE_LABEL }] } }),
      create: async () => { created = true; },
    } },
  };
  const label = await ensureQuarantineLabel(gmail);
  assert.equal(label.id, 'Label_42');
  assert.equal(created, false);
});

test('creates the quarantine label when it is missing', async () => {
  const gmail = {
    users: { labels: {
      list: async () => ({ data: { labels: [] } }),
      create: async ({ requestBody }) => ({ data: { id: 'Label_new', ...requestBody } }),
    } },
  };
  const label = await ensureQuarantineLabel(gmail);
  assert.equal(label.id, 'Label_new');
  assert.equal(label.name, QUARANTINE_LABEL);
});
