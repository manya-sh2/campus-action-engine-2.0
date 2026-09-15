const env = require('../config/env');
const authService = require('../services/auth.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Establishes req.user from the session cookie set during the Google
// OAuth callback. This is the ONLY source of identity for protected
// routes - a userId in the request body/query/params is never trusted
// for authorization purposes.
//
// Reused as-is by Gmail, Classroom, and Drive routes today, and by
// future task routes / MCP authorization.
const requireAuth = asyncHandler(async (req, res, next) => {
  const rawToken = req.cookies ? req.cookies[env.SESSION_COOKIE_NAME] : undefined;

  const user = await authService.verifySession(rawToken);
  if (!user) {
    throw ApiError.unauthorized('Not authenticated. Please sign in with Google.');
  }

  req.user = user;
  next();
});

module.exports = requireAuth;
