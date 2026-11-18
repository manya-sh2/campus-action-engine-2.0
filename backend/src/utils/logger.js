// Structured terminal logs. Only operational fields are permitted: never log
// request bodies, headers, email subjects/content, tokens, or raw provider errors.
const SAFE_FIELDS = new Set([
  'syncId', 'provider', 'model', 'mock', 'batch', 'items', 'fetched', 'processed',
  'created', 'duplicates', 'ignored', 'expired', 'deferred', 'failed', 'outOfWindow',
  'remaining', 'budget', 'durationMs', 'status', 'attempt', 'code', 'method', 'route',
]);

function log(event, fields = {}, level = 'info') {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key, value]) =>
    SAFE_FIELDS.has(key) && ['string', 'number', 'boolean'].includes(typeof value)));
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...safe });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = { log };
