import { google } from 'googleapis';

export const ISOLATION_LABEL = 'MailMind/À supprimer';
export const LEGACY_QUARANTINE_LABEL = 'MailMind/Quarantine';
export const QUARANTINE_LABEL = ISOLATION_LABEL;

export function isValidMessageId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{4,128}$/.test(value);
}

export async function findQuarantineLabel(gmail) {
  const response = await gmail.users.labels.list({ userId: 'me' });
  const labels = response.data.labels || [];
  return labels.find((label) => label.name === ISOLATION_LABEL)
    || labels.find((label) => label.name === LEGACY_QUARANTINE_LABEL)
    || null;
}

export async function ensureQuarantineLabel(gmail) {
  const existing = await findQuarantineLabel(gmail);
  if (existing?.name === ISOLATION_LABEL) return existing;
  if (existing) {
    const response = await gmail.users.labels.update({
      userId: 'me',
      id: existing.id,
      requestBody: {
        name: ISOLATION_LABEL,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    return response.data;
  }

  const response = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: ISOLATION_LABEL,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });
  return response.data;
}

export async function quarantineMessage(oauthClient, messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  return labelMessageForReview(gmail, messageId);
}

export async function labelMessageForReview(gmail, messageId) {
  const label = await ensureQuarantineLabel(gmail);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: [label.id] },
  });
  return { id: messageId, quarantined: true, isolated: false, label: ISOLATION_LABEL };
}

export async function isolateMessage(oauthClient, messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  return isolateMessageWithGmail(gmail, messageId);
}

export async function isolateMessageWithGmail(gmail, messageId) {
  const label = await ensureQuarantineLabel(gmail);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: [label.id], removeLabelIds: ['INBOX'] },
  });
  return { id: messageId, quarantined: true, isolated: true, label: ISOLATION_LABEL };
}

export async function restoreMessage(oauthClient, messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  return restoreMessageWithGmail(gmail, messageId);
}

export async function restoreMessageWithGmail(gmail, messageId) {
  const label = await requireIsolationLabel(gmail, messageId);

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: ['INBOX'], removeLabelIds: [label.id] },
  });
  return { id: messageId, quarantined: false, isolated: false, label: ISOLATION_LABEL };
}

async function requireIsolationLabel(gmail, messageId) {
  const label = await findQuarantineLabel(gmail);
  if (!label) {
    const error = new Error('Le sas MailMind est absent.');
    error.code = 'NOT_ISOLATED';
    throw error;
  }
  const response = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'minimal', fields: 'id,labelIds' });
  if (!(response.data.labelIds || []).includes(label.id)) {
    const error = new Error('Ce message n’est plus dans le sas MailMind.');
    error.code = 'NOT_ISOLATED';
    throw error;
  }
  return label;
}

export async function markIsolatedAsSpam(oauthClient, messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  return markIsolatedAsSpamWithGmail(gmail, messageId);
}

export async function markIsolatedAsSpamWithGmail(gmail, messageId) {
  const label = await requireIsolationLabel(gmail, messageId);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX', label.id] },
  });
  return { id: messageId, isolated: false, spam: true };
}

export async function trashIsolatedMessage(oauthClient, messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  return trashIsolatedMessageWithGmail(gmail, messageId);
}

export async function trashIsolatedMessageWithGmail(gmail, messageId) {
  await requireIsolationLabel(gmail, messageId);
  await gmail.users.messages.trash({ userId: 'me', id: messageId });
  return { id: messageId, isolated: false, trashed: true };
}

export async function listAllIsolatedMessageIds(gmail, limit = 500) {
  const label = await findQuarantineLabel(gmail);
  if (!label) return [];
  const ids = [];
  let pageToken;
  do {
    const response = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [label.id],
      q: '-in:trash -in:spam',
      maxResults: Math.min(500, limit - ids.length),
      pageToken,
    });
    ids.push(...(response.data.messages || []).map((message) => message.id));
    pageToken = response.data.nextPageToken;
    if (pageToken && ids.length >= limit) {
      const error = new Error(`Le sas dépasse la limite de sécurité de ${limit} messages.`);
      error.code = 'ISOLATION_LIMIT_EXCEEDED';
      throw error;
    }
  } while (pageToken);
  return ids;
}

async function mapWithConcurrency(values, concurrency, callback) {
  const queue = [...values];
  const results = [];
  async function worker() {
    while (queue.length) {
      const value = queue.shift();
      try { await callback(value); results.push({ status: 'fulfilled', value }); }
      catch (error) { results.push({ status: 'rejected', value, error }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export async function trashAllIsolatedMessages(oauthClient, expectedCount) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  return trashAllIsolatedMessagesWithGmail(gmail, expectedCount);
}

export async function trashAllIsolatedMessagesWithGmail(gmail, expectedCount) {
  const ids = await listAllIsolatedMessageIds(gmail);
  if (ids.length !== expectedCount) {
    const error = new Error('Le contenu du sas a changé. Actualisez avant de confirmer.');
    error.code = 'ISOLATION_COUNT_CHANGED';
    error.actualCount = ids.length;
    throw error;
  }
  const results = await mapWithConcurrency(ids, 5, (id) => gmail.users.messages.trash({ userId: 'me', id }));
  const failed = results.filter((result) => result.status === 'rejected').length;
  return { requested: ids.length, trashed: ids.length - failed, failed };
}
