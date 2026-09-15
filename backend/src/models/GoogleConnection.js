const mongoose = require('mongoose');

// Stores a user's OAuth credentials for a given provider, kept
// deliberately separate from the User profile. Tokens are encrypted at
// rest (see utils/crypto.js) and excluded from queries by default
// (`select: false`) - callers must explicitly opt in with
// `.select('+accessToken +refreshToken')` when they actually need them
// (only oauth.service.js should ever do this).
const googleConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Kept as an explicit field (rather than assuming "google") so
    // additional providers could be added later without a schema change.
    provider: {
      type: String,
      required: true,
      enum: ['google'],
      default: 'google',
    },
    accessToken: {
      type: String,
      required: true,
      select: false,
    },
    refreshToken: {
      type: String,
      required: true,
      select: false,
    },
    // Epoch milliseconds, as returned by Google's token response.
    expiryDate: {
      type: Number,
      required: true,
    },
    scopes: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// One connection per user per provider - re-authenticating updates the
// existing document (see oauth.service.js#saveConnection) instead of
// creating a duplicate.
googleConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

// Defense in depth: even if a query forgets to exclude token fields,
// they never leak through JSON serialization (e.g. accidental
// `res.json(connection)` somewhere down the line).
googleConnectionSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.accessToken;
    delete ret.refreshToken;
    return ret;
  },
});

module.exports = mongoose.model('GoogleConnection', googleConnectionSchema);
