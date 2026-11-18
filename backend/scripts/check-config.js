// Windows-friendly configuration check. Never prints credentials.
const fs = require('fs');
const env = require('../src/config/env');

const hasEnvFile = fs.existsSync(env.ENV_FILE_PATH);
const isGemini = env.AI_PROVIDER === 'gemini';
const expectedKeyName = isGemini ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
const hasKey = Boolean(env[expectedKeyName]);
const isConfigured = env.AI_MOCK_MODE || (['gemini', 'openai'].includes(env.AI_PROVIDER) && hasKey);

console.log('\nCampus Action Engine - AI configuration');
console.log('Backend .env path:', env.ENV_FILE_PATH);
console.log('backend/.env exists:', hasEnvFile ? 'YES' : 'NO');
console.log('AI_PROVIDER:', env.AI_PROVIDER);
console.log(`${expectedKeyName} loaded:`, hasKey ? 'YES (value hidden)' : 'NO');
console.log('AI_MOCK_MODE:', env.AI_MOCK_MODE ? 'ON' : 'OFF');
if (isGemini) {
  console.log('GEMINI_MODEL:', env.GEMINI_MODEL);
  console.log('GEMINI_BASE_URL:', env.GEMINI_BASE_URL);
  console.log('GEMINI_MIN_REQUEST_INTERVAL_MS:', env.GEMINI_MIN_REQUEST_INTERVAL_MS);
  console.log('GEMINI_MAX_REQUESTS_PER_MINUTE:', env.GEMINI_MAX_REQUESTS_PER_MINUTE);
  console.log('GEMINI_DAILY_REQUEST_BUDGET:', env.GEMINI_DAILY_REQUEST_BUDGET);
  console.log('GEMINI_BATCH_SIZE:', env.GEMINI_BATCH_SIZE);
  console.log('GEMINI_MAX_ITEMS_PER_SYNC:', env.GEMINI_MAX_ITEMS_PER_SYNC);
  try {
    const local = require('../src/services/ai/geminiQuota').getStatus();
    console.log('Local Gemini requests used today:', local.used);
    console.log('Local Gemini requests remaining today:', local.remaining);
    if (local.blocked) console.log('Gemini cooldown/quota block: ACTIVE');
  } catch (err) {
    console.log('Local quota status could not be read:', err.message);
  }
} else {
  console.log('OPENAI_MODEL:', env.OPENAI_MODEL);
}

if (!hasEnvFile) {
  console.error('Create backend/.env from backend/.env.example, not frontend/.env.');
  console.error('Windows: enable file extensions and check that the filename is not .env.txt.');
}
if (!isConfigured) {
  console.error(`\nNOT READY: set ${expectedKeyName} in backend/.env or AI_MOCK_MODE=true.`);
  if (isGemini && env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is present, but Gemini mode requires GEMINI_API_KEY instead.');
  }
  console.error('Stop and restart npm run dev after editing .env.');
  process.exitCode = 1;
} else {
  console.log('\nAI configuration present. Key validity/model access/quota still require a live call.');
}
