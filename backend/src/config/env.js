// Loads and centralizes access to environment variables.
// All other modules should read config from here instead of
// calling process.env directly, so future phases (OAuth keys,
// OpenAI keys, etc.) have one place to extend.

const path = require('path');

// dotenv normally searches process.cwd(), which changes depending on
// where `node`/the IDE launches the server. Always load backend/.env.
// Existing process environment variables still take precedence, which
// is useful when the backend is deployed.
const ENV_FILE_PATH = path.resolve(__dirname, '../../.env');
require('dotenv').config({ path: ENV_FILE_PATH });

const env = {
  ENV_FILE_PATH,
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

  // --- AI extraction: Gemini (free tier) by default, or OpenAI if selected ---
  // The OpenAI JavaScript client can talk to Gemini's OpenAI-compatible API,
  // but it MUST use the Gemini endpoint and GEMINI_API_KEY.
  AI_PROVIDER: (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase(),
  GEMINI_API_KEY: (process.env.GEMINI_API_KEY || '').trim() || undefined,
  GEMINI_MODEL: (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim(),
  GEMINI_BASE_URL: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/').trim(),
  // A modest interval between requests reduces free-tier RPM errors.
  // Adjust according to your project's actual AI Studio rate limits.
  GEMINI_MIN_REQUEST_INTERVAL_MS: process.env.GEMINI_MIN_REQUEST_INTERVAL_MS === undefined
    ? 16000 : Number(process.env.GEMINI_MIN_REQUEST_INTERVAL_MS),
  // Conservative local caps; view actual limits in Google AI Studio.
  GEMINI_MAX_REQUESTS_PER_MINUTE: process.env.GEMINI_MAX_REQUESTS_PER_MINUTE === undefined
    ? 4 : Number(process.env.GEMINI_MAX_REQUESTS_PER_MINUTE),
  GEMINI_DAILY_REQUEST_BUDGET: process.env.GEMINI_DAILY_REQUEST_BUDGET === undefined
    ? 12 : Number(process.env.GEMINI_DAILY_REQUEST_BUDGET),
  GEMINI_MAX_ITEMS_PER_SYNC: process.env.GEMINI_MAX_ITEMS_PER_SYNC === undefined
    ? 24 : Number(process.env.GEMINI_MAX_ITEMS_PER_SYNC),
  GEMINI_BATCH_SIZE: process.env.GEMINI_BATCH_SIZE === undefined
    ? 4 : Number(process.env.GEMINI_BATCH_SIZE),
  OPENAI_API_KEY: (process.env.OPENAI_API_KEY || '').trim() || undefined,
  OPENAI_MODEL: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
  // AI_MOCK_MODE is the preferred name. Preserve the original setting as an alias.
  AI_MOCK_MODE: (process.env.AI_MOCK_MODE ?? process.env.OPENAI_MOCK_MODE ?? 'false')
    .trim().toLowerCase() === 'true',
  OPENAI_MOCK_MODE: (process.env.AI_MOCK_MODE ?? process.env.OPENAI_MOCK_MODE ?? 'false')
    .trim().toLowerCase() === 'true',

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
