const { google } = require('googleapis');
const env = require('../../config/env');
const { ALL_SCOPES } = require('../../config/googleScopes');
const GoogleConnection = require('../../models/GoogleConnection');
const { encrypt, decrypt } = require('../../utils/crypto');
const ApiError = require('../../utils/ApiError');

// This module is the ONLY place that talks to Google's OAuth endpoints
// or manages token refresh. Gmail/Classroom/Drive services never do
// their own token handling - they all call getAuthorizedClient() here.

function createOAuth2Client() {
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

/**
 * Builds the URL the frontend redirects the user to in order to grant
 * Google permissions. `state` should be an unguessable value the caller
 * verifies on callback (CSRF protection).
 */
function getAuthUrl(state) {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent', // ensures a refresh_token is returned even on repeat logins
    scope: ALL_SCOPES,
    state,
  });
}

/**
 * Exchanges an authorization code (from the OAuth callback) for tokens.
 */
async function exchangeCodeForTokens(code) {
  const client = createOAuth2Client();
  try {
    const { tokens } = await client.getToken(code);
    return tokens;
  } catch (err) {
    throw ApiError.badRequest('Failed to exchange authorization code with Google. It may be invalid or expired.');
  }
}

/**
 * Fetches the Google identity (id, email, name) for a freshly-obtained
 * set of tokens.
 */
async function getGoogleProfile(tokens) {
  const client = createOAuth2Client();
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });

  let data;
  try {
    ({ data } = await oauth2.userinfo.get());
  } catch (err) {
    throw ApiError.badGateway('Failed to retrieve Google profile information.');
  }

  if (!data.id || !data.email) {
    throw ApiError.badRequest('Google did not return a usable profile (missing id/email).');
  }

  return { googleId: data.id, email: data.email, name: data.name };
}

/**
 * Creates or updates the GoogleConnection for a user with freshly
 * exchanged tokens. Google only returns a refresh_token on the FIRST
 * consent (or when prompt=consent forces re-consent) - if a later
 * exchange doesn't include one, the existing refresh_token is kept
 * rather than overwritten with nothing.
 */
async function saveConnection(userId, tokens) {
  const existing = await GoogleConnection.findOne({ userId, provider: 'google' }).select('+refreshToken');

  const refreshToken = tokens.refresh_token || (existing ? decrypt(existing.refreshToken) : null);

  if (!refreshToken) {
    throw ApiError.badRequest(
      'Google did not provide a refresh token. Revoke this app\'s access in your Google Account ' +
        '(myaccount.google.com/permissions) and try connecting again so Google issues a fresh one.'
    );
  }

  const update = {
    userId,
    provider: 'google',
    accessToken: encrypt(tokens.access_token),
    refreshToken: encrypt(refreshToken),
    expiryDate: tokens.expiry_date,
    scopes: (tokens.scope || '').split(' ').filter(Boolean),
  };

  const connection = await GoogleConnection.findOneAndUpdate({ userId, provider: 'google' }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    runValidators: true,
  });

  return connection;
}

/**
 * Returns a googleapis OAuth2 client pre-loaded with valid credentials
 * for the given application user. Automatically refreshes the access
 * token if it's expired/expiring and persists the refreshed token back
 * to MongoDB. This is the single shared credential mechanism every
 * Google service (Gmail, Classroom, Drive) reuses - token refresh logic
 * lives ONLY here, not duplicated per-service.
 */
async function getAuthorizedClient(userId) {
  const connection = await GoogleConnection.findOne({ userId, provider: 'google' }).select(
    '+accessToken +refreshToken'
  );

  if (!connection) {
    throw ApiError.badRequest('No Google account connected. Connect Google via GET /api/auth/google first.');
  }

  const client = createOAuth2Client();
  client.setCredentials({
    access_token: decrypt(connection.accessToken),
    refresh_token: decrypt(connection.refreshToken),
    expiry_date: connection.expiryDate,
  });

  // google-auth-library emits 'tokens' whenever it silently refreshes the
  // access token (e.g. because it had expired). Persist that back to
  // Mongo so future requests reuse it instead of refreshing again.
  client.on('tokens', async (newTokens) => {
    try {
      const patch = {};
      if (newTokens.access_token) patch.accessToken = encrypt(newTokens.access_token);
      if (newTokens.refresh_token) patch.refreshToken = encrypt(newTokens.refresh_token);
      if (newTokens.expiry_date) patch.expiryDate = newTokens.expiry_date;
      if (Object.keys(patch).length > 0) {
        await GoogleConnection.updateOne({ _id: connection._id }, patch);
      }
    } catch (persistErr) {
      // Never let a persistence failure break the in-flight request;
      // the next call will just refresh again.
      console.error('[oauth] Failed to persist refreshed Google token:', persistErr.message);
    }
  });

  // Forces a refresh now if the current access token is expired/expiring;
  // no-ops if it's still valid. Triggers the 'tokens' handler above when
  // it does refresh.
  try {
    await client.getAccessToken();
  } catch (err) {
    throw ApiError.unauthorized('Google access has expired or been revoked. Please reconnect your Google account.');
  }

  return client;
}

module.exports = {
  createOAuth2Client,
  getAuthUrl,
  exchangeCodeForTokens,
  getGoogleProfile,
  saveConnection,
  getAuthorizedClient,
};
