const User = require('../models/User');
const ApiError = require('../utils/ApiError');

// Service layer for user profile operations. Controllers should never
// touch the User model directly - they go through here. Future phases
// (eligibility, importance, priority engines) will import from this
// service too, so keep the surface area intentional and not bloated
// with CRUD-for-CRUD's-sake methods.

/**
 * Create a new user profile.
 * @param {object} payload - validated user fields
 */
async function createUser(payload) {
  const existing = await User.findOne({ email: payload.email });
  if (existing) {
    throw ApiError.conflict(`A user with email '${payload.email}' already exists`);
  }

  const user = await User.create(payload);
  return user;
}

/**
 * Find a user by their Mongo _id.
 * @param {string} id
 */
async function findUserById(id) {
  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound(`User with id '${id}' not found`);
  }
  return user;
}

/**
 * Find a user by email. Returns null if not found (does not throw) -
 * callers decide whether "not found" is an error in their context.
 * @param {string} email
 */
async function findUserByEmail(email) {
  return User.findOne({ email: email.toLowerCase().trim() });
}

/**
 * Update a user's profile fields.
 * @param {string} id
 * @param {object} updates - validated partial fields
 */
async function updateUserProfile(id, updates) {
  const user = await User.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    throw ApiError.notFound(`User with id '${id}' not found`);
  }

  return user;
}

module.exports = {
  createUser,
  findUserById,
  findUserByEmail,
  updateUserProfile,
};
