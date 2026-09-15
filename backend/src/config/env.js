// Loads and centralizes access to environment variables.
// All other modules should read config from here instead of
// calling process.env directly, so future phases (OAuth keys,
// OpenAI keys, etc.) have one place to extend.

require('dotenv').config();

const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/campus-action-engine',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',

  // --- Google OAuth (Phase 2) ---
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback',

  // AES-256-GCM key (64 hex chars / 32 bytes) used to encrypt stored
  // Google access/refresh tokens at rest.
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,

  // Application session cookie (separate from Google's own tokens).
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'cae_session',
  SESSION_TTL_DAYS: process.env.SESSION_TTL_DAYS ? Number(process.env.SESSION_TTL_DAYS) : 7,

  // When true, Gmail/Classroom/Drive services return canned sample data
  // instead of calling real Google APIs. For local development only when
  // real Google Cloud OAuth credentials aren't available yet. Never true
  // in production.
  GOOGLE_MOCK_MODE: process.env.GOOGLE_MOCK_MODE === 'true',

  // --- OpenAI (Phase 3) ---
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  // Any current model that supports Structured Outputs (response_format:
  // json_schema). Update this if OPENAI_MODEL's default below is no
  // longer available on your account.
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  // When true, the LLM extraction step uses a small deterministic
  // rule-based parser (services/ai/mock.extraction.js) instead of
  // calling the real OpenAI API - useful for local development without
  // an OpenAI API key. Never true in production.
  OPENAI_MOCK_MODE: process.env.OPENAI_MOCK_MODE === 'true',

  // --- Realtime + Automation (Phase 4) ---
  // Socket.IO reuses CLIENT_URL for CORS and SESSION_COOKIE_NAME/
  // authService.verifySession for auth - no separate config needed.

  // Standard cron expression for the deadline-check job. Default: every
  // 15 minutes. See https://github.com/node-cron/node-cron for syntax.
  DEADLINE_CRON_SCHEDULE: process.env.DEADLINE_CRON_SCHEDULE || '*/15 * * * *',

  // Set to "false" to disable the scheduled deadline job entirely (e.g.
  // in tests, or in a multi-instance deployment where only one instance
  // should run it). Defaults to enabled.
  ENABLE_DEADLINE_CRON: process.env.ENABLE_DEADLINE_CRON !== 'false',

  // MCP reuses the exact same session cookie mechanism as the REST API
  // (see routes/mcp.routes.js) - no separate MCP auth config needed.
};

module.exports = env;
