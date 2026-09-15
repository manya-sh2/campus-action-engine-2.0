const crypto = require('crypto');
const env = require('../config/env');
const oauthService = require('../services/google/oauth.service');
const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

const OAUTH_STATE_COOKIE = 'cae_oauth_state';

const cookieBaseOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
};

// GET /api/auth/google
// Redirects the user to Google's consent screen. A random `state` value
// is stashed in a short-lived cookie and checked on callback to guard
// against CSRF.
const startGoogleAuth = asyncHandler(async (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');

  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...cookieBaseOptions,
    maxAge: 10 * 60 * 1000, // 10 minutes - long enough to complete consent
  });

  const url = oauthService.getAuthUrl(state);
  res.redirect(url);
});

// GET /api/auth/google/callback
// Exchanges the authorization code, resolves/creates the application
// User, stores the Google connection, and starts an application session.
const handleGoogleCallback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  const expectedState = req.cookies ? req.cookies[OAUTH_STATE_COOKIE] : undefined;

  res.clearCookie(OAUTH_STATE_COOKIE, cookieBaseOptions);

  if (error) {
    return res.redirect(`${env.CLIENT_URL}/?googleAuthError=${encodeURIComponent(error)}`);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return res.redirect(`${env.CLIENT_URL}/?googleAuthError=invalid_state`);
  }

  const tokens = await oauthService.exchangeCodeForTokens(code);
  const profile = await oauthService.getGoogleProfile(tokens);
  const user = await authService.findOrCreateUserFromGoogleProfile(profile);
  await oauthService.saveConnection(user._id, tokens);

  const { rawToken, expiresAt } = await authService.createSession(user._id, {
    userAgent: req.get('user-agent'),
  });

  res.cookie(env.SESSION_COOKIE_NAME, rawToken, {
    ...cookieBaseOptions,
    expires: expiresAt,
  });

  return res.redirect(`${env.CLIENT_URL}/?googleConnected=true`);
});

// GET /api/auth/me
const getCurrentUser = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: req.user });
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  const rawToken = req.cookies ? req.cookies[env.SESSION_COOKIE_NAME] : undefined;
  await authService.destroySession(rawToken);
  res.clearCookie(env.SESSION_COOKIE_NAME, cookieBaseOptions);
  sendSuccess(res, { message: 'Logged out' });
});

module.exports = { startGoogleAuth, handleGoogleCallback, getCurrentUser, logout };
