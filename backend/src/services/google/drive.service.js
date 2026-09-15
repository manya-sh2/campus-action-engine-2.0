const { google } = require('googleapis');
const { Readable } = require('stream');
const env = require('../../config/env');
const oauthService = require('./oauth.service');
const translateGoogleError = require('../../utils/translateGoogleError');
const ApiError = require('../../utils/ApiError');
const mockData = require('./mock.data');

function driveClient(authClient) {
  return google.drive({ version: 'v3', auth: authClient });
}

function normalizeFile(f) {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
    iconLink: f.iconLink,
  };
}

/**
 * @param {string} userId
 * @param {{ q?: string, pageSize?: number }} options
 *
 * NOTE: this app requests the narrow `drive.file` scope (see
 * config/googleScopes.js), which means search only sees files the app
 * itself created or that the user explicitly opened with it - not the
 * user's entire Drive. See README for the tradeoff.
 */
async function listFiles(userId, { q, pageSize = 20 } = {}) {
  if (env.GOOGLE_MOCK_MODE) {
    const query = (q || '').toLowerCase();
    return mockData.driveFiles.filter((f) => !query || f.name.toLowerCase().includes(query));
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const drive = driveClient(client);

  const queryParts = ['trashed = false'];
  if (q) {
    const escaped = q.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    queryParts.push(`name contains '${escaped}'`);
  }

  try {
    const { data } = await drive.files.list({
      q: queryParts.join(' and '),
      pageSize,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink)',
    });
    return (data.files || []).map(normalizeFile);
  } catch (err) {
    throw translateGoogleError(err, 'Google Drive');
  }
}

async function getFileMetadata(userId, fileId) {
  if (env.GOOGLE_MOCK_MODE) {
    const found = mockData.driveFiles.find((f) => f.id === fileId);
    if (!found) throw ApiError.notFound(`Mock Drive file '${fileId}' not found`);
    return found;
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const drive = driveClient(client);

  try {
    const { data } = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, modifiedTime, webViewLink, iconLink',
    });
    return normalizeFile(data);
  } catch (err) {
    throw translateGoogleError(err, 'Google Drive');
  }
}

/**
 * Uploads a file to the authenticated user's Drive.
 * @param {string} userId
 * @param {{ originalname: string, mimetype: string, buffer: Buffer }} file - a Multer memory-storage file
 */
async function uploadFile(userId, file) {
  if (!file) {
    throw ApiError.badRequest('No file provided');
  }

  if (env.GOOGLE_MOCK_MODE) {
    return {
      id: `mock-${Date.now()}`,
      name: file.originalname,
      mimeType: file.mimetype,
      webViewLink: 'https://drive.google.com/mock-file',
    };
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const drive = driveClient(client);

  try {
    const { data } = await drive.files.create({
      requestBody: { name: file.originalname },
      media: {
        mimeType: file.mimetype,
        body: Readable.from(file.buffer),
      },
      fields: 'id, name, mimeType, webViewLink',
    });
    return normalizeFile(data);
  } catch (err) {
    throw translateGoogleError(err, 'Google Drive');
  }
}

module.exports = { listFiles, getFileMetadata, uploadFile };
