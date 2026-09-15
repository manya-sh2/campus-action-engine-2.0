const crypto = require('crypto');
const Session = require('../models/Session');
const User = require('../models/User');
const env = require('../config/env');

const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Creates a new application session for a user and returns the raw
 * token to be set as an httpOnly cookie. Only the hash is persisted.
 */
async function createSession(userId, { userAgent } = {}) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await Session.create({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt,
    userAgent,
  });

  return { rawToken, expiresAt };
}

/**
 * Verifies a raw session token from a cookie and returns the associated
 * User, or null if the token is missing, unknown, or expired.
 */
async function verifySession(rawToken) {
  if (!rawToken) return null;

  const session = await Session.findOne({ tokenHash: hashToken(rawToken) });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }

  const user = await User.findById(session.userId);
  if (!user) return null;

  return user;
}

/**
 * Destroys a session (logout). No-ops silently if the token is unknown.
 */
async function destroySession(rawToken) {
  if (!rawToken) return;
  await Session.deleteOne({ tokenHash: hashToken(rawToken) });
}

/**
 * Resolves the application User for a Google profile returned by the
 * OAuth callback. Never creates a duplicate user for the same Google
 * account:
 *   1. Match by googleId (returning Google user).
 *   2. Fall back to matching by email (e.g. a user created earlier via
 *      the Phase 1 dev endpoint, now connecting Google for the first
 *      time) and attach the googleId to that existing profile.
 *   3. Otherwise create a new User.
 */
async function findOrCreateUserFromGoogleProfile(profile) {
  const { googleId, email, name } = profile;

  let user = await User.findOne({ googleId });
  if (user) return user;

  user = await User.findOne({ email: email.toLowerCase().trim() });
  if (user) {
    user.googleId = googleId;
    if (!user.name && name) user.name = name;
    await user.save();
    return user;
  }

  user = await User.create({
    name: name || email.split('@')[0],
    email,
    googleId,
  });

  return user;
}

module.exports = {
  createSession,
  verifySession,
  destroySession,
  findOrCreateUserFromGoogleProfile,
};
