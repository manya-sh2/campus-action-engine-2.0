const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const validateUserInput = require('../utils/validateUserInput');

// Controllers stay thin: validate/shape input, call the service layer,
// shape the response. No business logic lives here.

/**
 * GET/PATCH /:id are authenticated (requireAuth), but a session proves
 * only WHO you are, not that the :id in the URL belongs to you - that
 * check happens here. req.user comes from the verified session; the
 * :id path param is client-supplied and never trusted on its own.
 */
function assertOwnProfile(req) {
  if (String(req.params.id) !== String(req.user._id)) {
    throw ApiError.forbidden('You can only access your own profile.');
  }
}

// POST /api/users
// NOTE: This remains an unauthenticated Phase 1 dev-only endpoint for
// creating a user profile before that person has ever signed in with
// Google (there's no session to authenticate against yet at that
// point). GET/PATCH below are authenticated and ownership-checked -
// only POST (creation) is still open.
const createUser = asyncHandler(async (req, res) => {
  const errors = validateUserInput(req.body, { partial: false });
  if (errors.length > 0) {
    throw ApiError.badRequest('Validation failed', errors);
  }

  const user = await userService.createUser(req.body);
  sendSuccess(res, { statusCode: 201, message: 'User created', data: user });
});

// GET /api/users/:id (authenticated, own profile only)
const getUserById = asyncHandler(async (req, res) => {
  assertOwnProfile(req);
  const user = await userService.findUserById(req.params.id);
  sendSuccess(res, { data: user });
});

// PATCH /api/users/:id (authenticated, own profile only)
const updateUser = asyncHandler(async (req, res) => {
  assertOwnProfile(req);

  const errors = validateUserInput(req.body, { partial: true });
  if (errors.length > 0) {
    throw ApiError.badRequest('Validation failed', errors);
  }

  const user = await userService.updateUserProfile(req.params.id, req.body);
  sendSuccess(res, { message: 'User updated', data: user });
});

module.exports = {
  createUser,
  getUserById,
  updateUser,
};
