const mongoose = require('mongoose');

// Backs the application's own login session, established after a
// successful Google OAuth callback. The raw session token lives only in
// the user's httpOnly cookie; we store just its hash here, so a database
// leak alone can't be used to impersonate a logged-in user.
const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    userAgent: {
      type: String,
    },
  },
  { timestamps: true }
);

// TTL index: MongoDB automatically removes a session document once
// `expiresAt` passes, so expired sessions don't need manual cleanup.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
