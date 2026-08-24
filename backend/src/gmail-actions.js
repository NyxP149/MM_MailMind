import { google } from 'googleapis';

export const QUARANTINE_LABEL = 'MailMind/Quarantine';

export function isValidMessageId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{4,128}$/.test(value);
}

export async function findQuarantineLabel(gmail) {
  const response = await gmail.users.labels.list({ userId: 'me' });
  return (response.data.labels || []).find((label) => label.name === QUARANTINE_LABEL) || null;
}

export async function ensureQuarantineLabel(gmail) {
  const existing = await findQuarantineLabel(gmail);
  if (existing) return existing;

  const response = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: QUARANTINE_LABEL,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });
  return response.data;
}

export async function quarantineMessage(oauthClient, messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  const label = await ensureQuarantineLabel(gmail);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: [label.id] },
  });
  return { id: messageId, quarantined: true, label: QUARANTINE_LABEL };
}

export async function restoreMessage(oauthClient, messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  const label = await findQuarantineLabel(gmail);
  if (!label) return { id: messageId, quarantined: false, label: QUARANTINE_LABEL };

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: [label.id] },
  });
  return { id: messageId, quarantined: false, label: QUARANTINE_LABEL };
}
