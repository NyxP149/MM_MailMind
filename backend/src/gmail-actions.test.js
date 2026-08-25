import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureQuarantineLabel,
  isolateMessageWithGmail,
  isValidMessageId,
  LEGACY_QUARANTINE_LABEL,
  markIsolatedAsSpamWithGmail,
  QUARANTINE_LABEL,
  restoreMessageWithGmail,
  trashAllIsolatedMessagesWithGmail,
  trashIsolatedMessageWithGmail,
} from './gmail-actions.js';

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

test('renames the legacy quarantine label without losing its messages', async () => {
  let update;
  const gmail = { users: { labels: {
    list: async () => ({ data: { labels: [{ id: 'Label_old', name: LEGACY_QUARANTINE_LABEL }] } }),
    update: async (request) => { update = request; return { data: { id: request.id, ...request.requestBody } }; },
  } } };
  const label = await ensureQuarantineLabel(gmail);
  assert.equal(label.name, QUARANTINE_LABEL);
  assert.equal(update.id, 'Label_old');
});

test('isolation archives the message and restoration returns it to the inbox', async () => {
  const mutations = [];
  const gmail = { users: {
    labels: { list: async () => ({ data: { labels: [{ id: 'Label_42', name: QUARANTINE_LABEL }] } }) },
    messages: {
      get: async ({ id }) => ({ data: { id, labelIds: ['Label_42'] } }),
      modify: async (request) => { mutations.push(request.requestBody); },
    },
  } };
  await isolateMessageWithGmail(gmail, 'message_1');
  await restoreMessageWithGmail(gmail, 'message_1');
  assert.deepEqual(mutations, [
    { addLabelIds: ['Label_42'], removeLabelIds: ['INBOX'] },
    { addLabelIds: ['INBOX'], removeLabelIds: ['Label_42'] },
  ]);
});

test('spam and trash are limited to messages already isolated', async () => {
  const modified = [];
  const trashed = [];
  const gmail = { users: {
    labels: { list: async () => ({ data: { labels: [{ id: 'Label_42', name: QUARANTINE_LABEL }] } }) },
    messages: {
      get: async ({ id }) => ({ data: { id, labelIds: id === 'isolated_1' ? ['Label_42'] : ['INBOX'] } }),
      modify: async (request) => { modified.push(request); },
      trash: async ({ id }) => { trashed.push(id); },
    },
  } };
  await markIsolatedAsSpamWithGmail(gmail, 'isolated_1');
  await trashIsolatedMessageWithGmail(gmail, 'isolated_1');
  await assert.rejects(() => restoreMessageWithGmail(gmail, 'regular_1'), { code: 'NOT_ISOLATED' });
  await assert.rejects(() => trashIsolatedMessageWithGmail(gmail, 'regular_1'), { code: 'NOT_ISOLATED' });
  assert.deepEqual(modified[0].requestBody, { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX', 'Label_42'] });
  assert.deepEqual(trashed, ['isolated_1']);
});

test('bulk trash verifies the exact snapshot before touching Gmail', async () => {
  const trashed = [];
  const gmail = { users: {
    labels: { list: async () => ({ data: { labels: [{ id: 'Label_42', name: QUARANTINE_LABEL }] } }) },
    messages: {
      list: async () => ({ data: { messages: [{ id: 'one_1' }, { id: 'two_2' }] } }),
      trash: async ({ id }) => { trashed.push(id); },
    },
  } };
  await assert.rejects(() => trashAllIsolatedMessagesWithGmail(gmail, 3), { code: 'ISOLATION_COUNT_CHANGED' });
  const result = await trashAllIsolatedMessagesWithGmail(gmail, 2);
  assert.deepEqual(result, { requested: 2, trashed: 2, failed: 0 });
  assert.deepEqual(trashed.sort(), ['one_1', 'two_2']);
});
