import { google } from 'googleapis';
import { classifyEmail, summarizeClassifications } from './classifier.js';
import { findQuarantineLabel } from './gmail-actions.js';

const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

export function createGoogleAuth(config) {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  );
}

export function createAuthorizationUrl(oauthClient, state) {
  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GMAIL_MODIFY_SCOPE],
    state,
  });
}

export function getHeader(headers = [], name) {
  return headers.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  )?.value || '';
}

export function parseAddress(value = '') {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  const email = match ? match[2] : value;
  const name = match ? match[1].replace(/^"|"$/g, '').trim() : email.split('@')[0];

  return { name: name || email, email };
}

export function normalizeMessage(message, quarantineLabelId = null) {
  const headers = message.payload?.headers || [];
  const from = parseAddress(getHeader(headers, 'From'));

  const normalized = {
    id: message.id,
    threadId: message.threadId,
    subject: getHeader(headers, 'Subject') || '(Sans objet)',
    from,
    date: getHeader(headers, 'Date'),
    snippet: message.snippet || '',
    labels: message.labelIds || [],
    unread: (message.labelIds || []).includes('UNREAD'),
    quarantined: Boolean(quarantineLabelId && (message.labelIds || []).includes(quarantineLabelId)),
  };

  return { ...normalized, classification: classifyEmail(normalized) };
}

export async function listMessages(oauthClient, { pageToken, maxResults = 20 } = {}) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  const quarantineLabel = await findQuarantineLabel(gmail);
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    maxResults: Math.min(Math.max(Number(maxResults) || 20, 1), 50),
    pageToken,
    q: 'in:anywhere',
  });

  const messageRefs = listResponse.data.messages || [];
  const messages = await Promise.all(
    messageRefs.map(async ({ id }) => {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      return normalizeMessage(response.data, quarantineLabel?.id);
    }),
  );

  return {
    messages,
    summary: summarizeClassifications(messages),
    nextPageToken: listResponse.data.nextPageToken || null,
    resultSizeEstimate: listResponse.data.resultSizeEstimate || messages.length,
  };
}

export async function getProfile(oauthClient) {
  const gmail = google.gmail({ version: 'v1', auth: oauthClient });
  const response = await gmail.users.getProfile({ userId: 'me' });
  return {
    email: response.data.emailAddress,
    messagesTotal: response.data.messagesTotal,
    threadsTotal: response.data.threadsTotal,
  };
}
