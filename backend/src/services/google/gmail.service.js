const { google } = require('googleapis');
const env = require('../../config/env');
const oauthService = require('./oauth.service');
const translateGoogleError = require('../../utils/translateGoogleError');
const ApiError = require('../../utils/ApiError');
const mockData = require('./mock.data');
const { LOOKBACK_DAYS, isWithinSyncWindow } = require('../../utils/syncWindow');

function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(data, 'base64').toString('utf8');
}

// Gmail message bodies come as a tree of MIME parts. Walk it to collect
// the plain-text and HTML bodies wherever they appear.
function extractBody(payload) {
  let text = '';
  let html = '';

  function walk(part) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      text += decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
      html += decodeBase64Url(part.body.data);
    }
    if (Array.isArray(part.parts)) {
      part.parts.forEach(walk);
    }
  }

  walk(payload);

  // Single-part messages carry the body directly, not under `parts`.
  if (!text && !html && payload && payload.body && payload.body.data) {
    text = decodeBase64Url(payload.body.data);
  }

  return { text, html };
}

function extractAttachments(payload, acc = []) {
  if (!payload) return acc;

  if (payload.filename && payload.body && (payload.body.attachmentId || payload.body.size)) {
    acc.push({
      filename: payload.filename,
      mimeType: payload.mimeType,
      size: payload.body.size,
      attachmentId: payload.body.attachmentId,
    });
  }

  if (Array.isArray(payload.parts)) {
    payload.parts.forEach((p) => extractAttachments(p, acc));
  }

  return acc;
}

function getHeader(headers, name) {
  const header = (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : undefined;
}

// Turns Gmail's raw message shape into something a future ingestion
// layer can consume directly, without embedding any priority/eligibility
// decisions here.
function normalizeMessage(raw) {
  const headers = raw.payload ? raw.payload.headers : [];
  const { text, html } = extractBody(raw.payload);

  return {
    id: raw.id,
    threadId: raw.threadId,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    snippet: raw.snippet,
    body: { text, html },
    attachments: extractAttachments(raw.payload),
    receivedAt: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : undefined,
    labelIds: raw.labelIds || [],
  };
}

/**
 * @param {string} userId - application user id (from req.user.id, never from request body)
 * @param {{ q?: string, maxResults?: number }} options
 */
async function getMessages(userId, options = {}) {
  // Bound a single sync to a reasonable number of messages to protect the
  // Gemini free-tier quota. Allow a caller to request a smaller/larger cap.
  const requested = Number(options.maxResults);
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(200, Math.floor(requested)) : 100;
  if (env.GOOGLE_MOCK_MODE) {
    return mockData.gmailMessages.filter((message) => isWithinSyncWindow(message.receivedAt)).slice(0, limit);
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    const messageRefs = [];
    let pageToken;
    do {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        maxResults: Math.min(100, limit - messageRefs.length),
        q: [options.q, `newer_than:${LOOKBACK_DAYS}d`].filter(Boolean).join(' '),
        ...(pageToken ? { pageToken } : {}),
      });
      messageRefs.push(...(listRes.data.messages || []));
      pageToken = listRes.data.nextPageToken;
    } while (pageToken && messageRefs.length < limit);

    // Gmail search timestamps are approximate boundaries: also validate
    // internalDate for each individual message, never the email Date header.
    const messages = [];
    // Avoid firing 100 message-detail requests at Google simultaneously.
    for (let offset = 0; offset < messageRefs.length; offset += 10) {
      const batch = await Promise.all(messageRefs.slice(offset, offset + 10).map(async (ref) => {
        const { data } = await gmail.users.messages.get({ userId: 'me', id: ref.id, format: 'full' });
        return normalizeMessage(data);
      }));
      messages.push(...batch);
    }

    return messages.filter((message) => isWithinSyncWindow(message.receivedAt));
  } catch (err) {
    throw translateGoogleError(err, 'Gmail');
  }
}

async function getMessageById(userId, messageId) {
  if (env.GOOGLE_MOCK_MODE) {
    const found = mockData.gmailMessages.find((m) => m.id === messageId);
    if (!found) throw ApiError.notFound(`Mock Gmail message '${messageId}' not found`);
    return found;
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    return normalizeMessage(data);
  } catch (err) {
    throw translateGoogleError(err, 'Gmail');
  }
}

module.exports = { getMessages, getMessageById };
