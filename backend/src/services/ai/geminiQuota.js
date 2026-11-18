// Conservative, local protection for a single Node.js backend using the Gemini
// FREE tier. The quotas in Google AI Studio are authoritative; this local cap
// deliberately stays BELOW the model's reported limits.
//
// Stored on disk so restarting nodemon does NOT reset our local request count.
// Never stores API keys, email contents or prompts.
const fs = require('node:fs');
const path = require('node:path');
const env = require('../../config/env');

const FILE = path.join(__dirname, '../../../.runtime/gemini-usage.json');
const MINUTE = 60 * 1000;

function pacificDay(now = Date.now()) {
  // Gemini daily free quotas reset at midnight US Pacific time (PST/PDT).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(now));
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.models ? parsed : { models: {} };
  } catch {
    return { models: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function modelState(state, model, now) {
  const day = pacificDay(now);
  if (!state.models[model] || state.models[model].day !== day) {
    state.models[model] = { day, requests: [], blockedUntil: 0, blockedForDay: false };
  }
  const entry = state.models[model];
  entry.requests = (entry.requests || []).filter((timestamp) => Number.isFinite(timestamp) && timestamp <= now);
  return entry;
}

function quotaError(message) {
  const err = new Error(message);
  err.isGlobalSyncFailure = true;
  err.isGeminiQuotaError = true;
  return err;
}

function getStatus(now = Date.now(), model = env.GEMINI_MODEL) {
  const state = readState();
  const entry = modelState(state, model, now);
  return {
    day: entry.day,
    used: entry.requests.length,
    budget: env.GEMINI_DAILY_REQUEST_BUDGET,
    remaining: Math.max(0, env.GEMINI_DAILY_REQUEST_BUDGET - entry.requests.length),
    blocked: Boolean(entry.blockedForDay || entry.blockedUntil > now),
  };
}

// Sync file writes happen *before* any await, so requests initiated by
// concurrent users in this Node process still reserve separate slots.
async function reserveRequest(model = env.GEMINI_MODEL) {
  for (;;) {
    const now = Date.now();
    const state = readState();
    const entry = modelState(state, model, now);
    if (entry.blockedForDay) {
      throw quotaError('Gemini reported its DAILY free-tier quota is exhausted for this model. Sync can resume after the Google quota resets at midnight Pacific time.');
    }
    if (entry.requests.length >= env.GEMINI_DAILY_REQUEST_BUDGET) {
      throw quotaError(`Local Gemini daily safety budget (${env.GEMINI_DAILY_REQUEST_BUDGET} requests) reached for this model. Nothing was deleted; sync again after midnight Pacific time.`);
    }
    if (entry.blockedUntil > now) {
      throw quotaError(`Gemini requested a cooldown after a per-minute limit. Try syncing again after ${new Date(entry.blockedUntil).toLocaleTimeString()}.`);
    }

    const minuteRequests = entry.requests.filter((t) => t > now - MINUTE);
    const mostRecent = entry.requests.length ? Math.max(...entry.requests) : 0;
    const minuteWait = minuteRequests.length >= env.GEMINI_MAX_REQUESTS_PER_MINUTE
      ? Math.min(...minuteRequests) + MINUTE - now : 0;
    const spacingWait = mostRecent ? mostRecent + env.GEMINI_MIN_REQUEST_INTERVAL_MS - now : 0;
    const delay = Math.max(0, minuteWait, spacingWait);
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay + 50));
      continue; // Recheck cap and other users' reservations after sleeping.
    }
    entry.requests.push(now); // Count attempts, even requests ending in 503/429.
    writeState(state);
    return getStatus(now, model);
  }
}

function blockModel(model, { daily = false, cooldownMs = 90 * 1000 } = {}) {
  const now = Date.now();
  const state = readState();
  const entry = modelState(state, model, now);
  if (daily) entry.blockedForDay = true;
  else entry.blockedUntil = Math.max(entry.blockedUntil, now + Math.max(0, cooldownMs));
  writeState(state);
}

module.exports = { reserveRequest, blockModel, getStatus, pacificDay };
