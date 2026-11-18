const mongoose = require('mongoose');

// Minimal record of source items already classified as IGNORE/expired.
// NO email body, title, API key or extracted personal data is stored.
// This prevents spending Gemini quota on the same irrelevant email every sync.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  source: { type: String, enum: ['gmail', 'classroom'], required: true },
  sourceId: { type: String, required: true },
  reason: { type: String, default: 'ignored' },
  processedAt: { type: Date, default: Date.now },
});
schema.index({ userId: 1, source: 1, sourceId: 1 }, { unique: true });
schema.index({ processedAt: 1 }, { expireAfterSeconds: 35 * 24 * 60 * 60 });
module.exports = mongoose.model('ProcessedSource', schema);
