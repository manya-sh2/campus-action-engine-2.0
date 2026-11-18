// Unit tests: no Google, Gemini, OpenAI, or MongoDB credentials are needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadWithStubs(filename, stubs, extras = {}) {
  const code = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith('/logger')) return { log: () => {} };
    if (name === 'node:crypto') return require('node:crypto');
    throw new Error(`Unexpected require in test: ${name}`);
  };
  const wrapped = vm.runInNewContext('(function (require, module, exports, process, __dirname) {\n' + code + '\n})', {
    console, Date, setTimeout,
  }, { filename });
  wrapped(localRequire, module, module.exports, extras.process || process, path.dirname(filename));
  return module.exports;
}

const root = path.join(__dirname, '..');
const llmPath = path.join(root, 'src/services/ai/llm.service.js');
const ApiError = require('../src/utils/ApiError');
const syncWindow = require('../src/utils/syncWindow');
const { EXTRACTION_JSON_SCHEMA } = require('../src/services/ai/extractionSchema');
function stubLlm(env, mockCreate) {
  const instances = [];
  class FakeOpenAI {
    constructor(options) {
      this.options = options;
      this.chat = { completions: { create: mockCreate || (async () => ({ choices: [{ message: { content: '{}' } }] })) } };
      instances.push(this);
    }
  }
  return {
    llm: loadWithStubs(llmPath, {
      openai: FakeOpenAI,
      '../../config/env': env,
      '../../utils/ApiError': ApiError,
      './extractionSchema': { EXTRACTION_JSON_SCHEMA },
      './mock.extraction': { extractMock: () => ({ mock: true }) },
      './geminiQuota': {
        reserveRequest: async () => {}, blockModel: () => {},
        getStatus: () => ({ used: 0, remaining: 12, budget: 12 }),
      },
    }),
    instances,
  };
}
const geminiEnv = {
  AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-gemini-key',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  GEMINI_MIN_REQUEST_INTERVAL_MS: 0, GEMINI_MAX_REQUESTS_PER_MINUTE: 4,
  GEMINI_DAILY_REQUEST_BUDGET: 12, GEMINI_MAX_ITEMS_PER_SYNC: 24,
  GEMINI_BATCH_SIZE: 4, AI_MOCK_MODE: false,
};

// Loader should work from any Windows IDE/process start directory.
test('env loader resolves backend/.env irrespective of process.cwd()', () => {
  let loadedPath;
  const fakeProcess = {
    env: { GEMINI_API_KEY: '  test-key  ', AI_MOCK_MODE: ' FALSE ' },
    cwd: () => path.join(root, '..', 'frontend'),
  };
  const env = loadWithStubs(path.join(root, 'src/config/env.js'), {
    path,
    dotenv: { config: ({ path: envPath }) => { loadedPath = envPath; return { parsed: {} }; } },
  }, { process: fakeProcess });
  assert.equal(loadedPath, path.resolve(root, '.env'));
  assert.equal(env.AI_PROVIDER, 'gemini');
  assert.equal(env.GEMINI_API_KEY, 'test-key');
  assert.equal(env.AI_MOCK_MODE, false);
});

test('Gemini preflight checks the right key and mock mode', () => {
  const missing = stubLlm({ ...geminiEnv, GEMINI_API_KEY: undefined }).llm;
  assert.throws(() => missing.assertAiConfigured(), /GEMINI_API_KEY/);
  assert.doesNotThrow(() => stubLlm({ ...geminiEnv, GEMINI_API_KEY: undefined, AI_MOCK_MODE: true }).llm.assertAiConfigured());
  assert.doesNotThrow(() => stubLlm(geminiEnv).llm.assertAiConfigured());
  assert.throws(() => stubLlm({ ...geminiEnv, AI_PROVIDER: 'xyz' }).llm.assertAiConfigured(), /Invalid AI_PROVIDER/);
});

test('Gemini requests use its endpoint and model, not the OpenAI endpoint/model', async () => {
  let request;
  const { llm, instances } = stubLlm(geminiEnv, async (params) => {
    request = params;
    return { choices: [{ message: { content: '{"classification":"IGNORE"}' } }] };
  });
  const result = await llm.extractStructuredInfo({ title: 'Assignment', source: 'gmail', sourceType: 'email', text: 'Due next week' });
  assert.equal(result.classification, 'IGNORE');
  assert.equal(instances.length, 1);
  assert.equal(instances[0].options.apiKey, 'test-gemini-key');
  assert.equal(instances[0].options.baseURL, 'https://generativelanguage.googleapis.com/v1beta/openai/');
  assert.equal(request.model, 'gemini-3.1-flash-lite');
  assert.equal(request.response_format.type, 'json_schema');
  assert.ok(request.response_format.json_schema.schema.properties.classification);
});

test('Gemini 429 reports one quota error and marks it global', async () => {
  const { llm } = stubLlm(geminiEnv, async () => {
    const err = new Error('RESOURCE_EXHAUSTED');
    err.status = 429;
    throw err;
  });
  await assert.rejects(llm.extractStructuredInfo({ title: 'x', source: 'gmail', sourceType: 'email' }),
    (err) => err.isGlobalSyncFailure === true && /per-minute\/token rate limit/.test(err.message));
});

test('Gemini receives the original timestamp, timezone and strict recruitment/academic scope', async () => {
  let request;
  const { llm } = stubLlm(geminiEnv, async (params) => {
    request = params;
    return { choices: [{ message: { content: '{"classification":"IGNORE"}' } }] };
  });
  await llm.extractStructuredInfo({ source: 'gmail', sourceType: 'email',
    title: 'Submit tomorrow', occurredAt: '2026-11-01T08:00:00Z', timezone: 'Asia/Kolkata' });
  assert.match(request.messages[0].content, /NOT the sync\/current date/);
  assert.match(request.messages[0].content, /placement-cell sender does NOT/);
  assert.match(request.messages[0].content, /hackathons/);
  assert.match(request.messages[1].content, /Original Received\/Published.*2026-11-01T08:00:00Z/);
  assert.match(request.messages[1].content, /Student timezone: Asia\/Kolkata/);
});

test('sync checks AI configuration before fetching Gmail or Classroom', async () => {
  const sentinel = new Error('Gemini config missing');
  let fetched = 0;
  const service = loadWithStubs(path.join(root, 'src/services/sync.service.js'), {
    './google/gmail.service': { getMessages: async () => { fetched++; return []; } },
    './google/classroom.service': { getCourses: async () => { fetched++; return []; } },
    './ingestion/normalizer': {
      normalizeGmailMessage: (x) => x,
      normalizeClassroomAnnouncement: (x) => x,
      normalizeClassroomCourseWork: (x) => x,
    },
    './decision/pipeline.service': { runPipeline: async () => ({}), ItemIgnoredError: class ItemIgnoredError extends Error {} },
    './task.service': { findExistingSourceKeys: async () => new Set(), backfillSourceDates: async () => {}, createTaskIfNotExists: async () => ({}) },
    './realtime/socket.service': { notifyTaskCreated: () => {} },
    './ai/llm.service': { assertAiConfigured: () => { throw sentinel; } },
    '../utils/syncWindow': syncWindow,
    '../utils/ApiError': ApiError,
  });
  await assert.rejects(service.syncUserTasks({ id: 'test' }), (err) => err === sentinel);
  assert.equal(fetched, 0);
});

test('sync skips previously saved items without calling Gemini', async () => {
  let attempted = 0;
  const service = loadWithStubs(path.join(root, 'src/services/sync.service.js'), {
    './google/gmail.service': { getMessages: async () => [
      { title: 'one', source: 'gmail', sourceId: '1', occurredAt: new Date().toISOString() },
      { title: 'two', source: 'gmail', sourceId: '2', occurredAt: new Date().toISOString() },
      { title: 'two duplicate', source: 'gmail', sourceId: '2', occurredAt: new Date().toISOString() },
    ] },
    './google/classroom.service': { getCourses: async () => [] },
    './ingestion/normalizer': {
      normalizeGmailMessage: (x) => x,
      normalizeClassroomAnnouncement: (x) => x,
      normalizeClassroomCourseWork: (x) => x,
    },
    './decision/pipeline.service': {
      runPipeline: async () => { attempted++; return {}; },
      ItemIgnoredError: class ItemIgnoredError extends Error {},
    },
    './task.service': {
      findExistingSourceKeys: async () => new Set([JSON.stringify(['gmail', '1'])]),
      backfillSourceDates: async () => {},
      createTaskIfNotExists: async () => ({ created: true, task: {} }),
    },
    './realtime/socket.service': { notifyTaskCreated: () => {} },
    './ai/llm.service': { assertAiConfigured: () => {} },
    '../utils/syncWindow': syncWindow,
    '../utils/ApiError': ApiError,
  });
  const summary = await service.syncUserTasks({ id: 'test' }, { includeClassroom: false });
  assert.equal(attempted, 1);
  assert.equal(summary.created, 1);
  assert.equal(summary.duplicates, 2);
});

test('sync stops after a global Gemini failure instead of repeating error per email', async () => {
  let attempted = 0;
  const globalError = new Error('Gemini quota exceeded');
  globalError.isGlobalSyncFailure = true;
  const service = loadWithStubs(path.join(root, 'src/services/sync.service.js'), {
    './google/gmail.service': { getMessages: async () => [
      { title: 'one', source: 'gmail', sourceId: '1', occurredAt: new Date().toISOString() },
      { title: 'two', source: 'gmail', sourceId: '2', occurredAt: new Date().toISOString() },
    ] },
    './google/classroom.service': { getCourses: async () => [] },
    './ingestion/normalizer': {
      normalizeGmailMessage: (x) => x,
      normalizeClassroomAnnouncement: (x) => x,
      normalizeClassroomCourseWork: (x) => x,
    },
    './decision/pipeline.service': {
      runPipeline: async () => { attempted++; throw globalError; },
      ItemIgnoredError: class ItemIgnoredError extends Error {},
    },
    './task.service': { findExistingSourceKeys: async () => new Set(), backfillSourceDates: async () => {}, createTaskIfNotExists: async () => ({}) },
    './realtime/socket.service': { notifyTaskCreated: () => {} },
    './ai/llm.service': { assertAiConfigured: () => {} },
    '../utils/syncWindow': syncWindow,
    '../utils/ApiError': ApiError,
  });
  const summary = await service.syncUserTasks({ id: 'test' }, { includeClassroom: false });
  assert.equal(summary.stoppedReason, globalError.message);
  assert.equal(summary.deferred, 2);
  assert.equal(attempted, 1);
});

test('Gemini batch packs multiple messages into ONE API call and matches indexes', async () => {
  let requests = 0;
  const { llm } = stubLlm(geminiEnv, async (params) => {
    requests++;
    assert.equal(params.response_format.json_schema.name, 'campus_batch_extraction');
    assert.equal(params.response_format.json_schema.schema.properties.items.type, 'array');
    return { choices: [{ message: { content: JSON.stringify({ items: [
      { index: 1, extraction: { title: 'second' } },
      { index: 0, extraction: { title: 'first' } },
    ] }) } }] };
  });
  const items = [
    { title: 'First', source: 'gmail', sourceType: 'email', text: 'First body' },
    { title: 'Second', source: 'classroom', sourceType: 'announcement', text: 'Second body' },
  ];
  const results = await llm.extractBatchStructuredInfo(items);
  assert.equal(requests, 1);
  assert.deepEqual(Array.from(results, (v) => v.title), ['first', 'second']);
});

test('Gemini batch rejects missing/duplicate indexes rather than mixing email results', async () => {
  const { llm } = stubLlm(geminiEnv, async () => ({ choices: [{ message: { content: JSON.stringify({ items: [
    { index: 0, extraction: {} }, { index: 0, extraction: {} },
  ] }) } }] }));
  await assert.rejects(llm.extractBatchStructuredInfo([
    { title: 'a', source: 'gmail', sourceType: 'email' },
    { title: 'b', source: 'gmail', sourceType: 'email' },
  ]), /duplicated or invalid item indexes/);
});

test('Gemini 503 attempts at most one retry and then returns an actionable global error', async () => {
  let attempts = 0;
  const { llm } = stubLlm(geminiEnv, async () => {
    attempts++;
    const err = new Error('High demand'); err.status = 503; throw err;
  });
  await assert.rejects(llm.extractStructuredInfo({ title: 'One', source: 'gmail', sourceType: 'email' }),
    (err) => err.isGlobalSyncFailure && /temporarily unavailable/.test(err.message));
  assert.equal(attempts, 2);
});

test('Gemini daily 429 is distinct from per-minute 429', async () => {
  const { llm } = stubLlm(geminiEnv, async () => {
    const err = new Error('Requests per day limit exceeded'); err.status = 429;
    err.error = { message: 'Requests per day limit exceeded', details: [
      { violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
    ] };
    throw err;
  });
  await assert.rejects(llm.extractStructuredInfo({ title: 'One', source: 'gmail', sourceType: 'email' }),
    (err) => err.isGlobalSyncFailure && /DAILY free-tier quota/.test(err.message));
});

test('sync batching stops on temporary provider outage, preserves completed items and defers remaining', async () => {
  const items = Array.from({ length: 9 }, (_, i) => ({
    title: `item ${i}`, source: 'gmail', sourceId: String(i), occurredAt: new Date().toISOString(),
  }));
  let batchCalls = 0;
  let createdCount = 0;
  const globalError = new Error('Gemini unavailable'); globalError.isGlobalSyncFailure = true;
  const service = loadWithStubs(path.join(root, 'src/services/sync.service.js'), {
    './google/gmail.service': { getMessages: async () => items },
    './google/classroom.service': { getCourses: async () => [] },
    './ingestion/normalizer': {
      normalizeGmailMessage: (x) => x,
      normalizeClassroomAnnouncement: (x) => x,
      normalizeClassroomCourseWork: (x) => x,
    },
    './decision/pipeline.service': {
      runPipeline: async (item, user, extracted) => {
        assert.equal(extracted.title, item.title);
        return { ...item, deadline: null };
      },
      ItemIgnoredError: class ItemIgnoredError extends Error {},
    },
    './task.service': {
      findExistingSourceKeys: async () => new Set(), backfillSourceDates: async () => {},
      createTaskIfNotExists: async (_, item) => { createdCount++; return { created: true, task: item }; },
    },
    './realtime/socket.service': { notifyTaskCreated: () => {} },
    './ai/llm.service': {
      assertAiConfigured: () => {},
      getSyncLimits: () => ({ maxItems: 8, batchSize: 4 }),
      getQuotaStatus: () => ({ used: 2, remaining: 10, budget: 12 }),
      extractBatchStructuredInfo: async (batch) => {
        batchCalls++;
        if (batchCalls === 2) throw globalError;
        return batch.map((v) => ({ title: v.title }));
      },
    },
    '../utils/syncWindow': syncWindow,
    '../utils/ApiError': ApiError,
  });
  const summary = await service.syncUserTasks({ id: 'u' }, { includeClassroom: false });
  assert.equal(batchCalls, 2);
  assert.equal(createdCount, 4);
  assert.equal(summary.created, 4);
  assert.equal(summary.deferred, 5); // Four stopped + one past this sync's cap.
  assert.equal(summary.stoppedReason, 'Gemini unavailable');
  assert.equal(summary.quota.remaining, 10);
});

test('local Gemini request ledger counts attempts across module reloads', async () => {
  let data;
  const fakeFs = {
    readFileSync: () => { if (!data) throw Error('missing'); return data; },
    mkdirSync: () => {},
    writeFileSync: (filename, contents) => { data = contents; },
  };
  const quotaFile = path.join(root, 'src/services/ai/geminiQuota.js');
  const quotaEnv = { GEMINI_MODEL: 'model-a', GEMINI_DAILY_REQUEST_BUDGET: 2,
    GEMINI_MAX_REQUESTS_PER_MINUTE: 10, GEMINI_MIN_REQUEST_INTERVAL_MS: 0 };
  const create = () => loadWithStubs(quotaFile, {
    'node:fs': fakeFs, 'node:path': path, '../../config/env': quotaEnv,
  });
  const first = create();
  await first.reserveRequest();
  assert.equal(first.getStatus().remaining, 1);
  const restarted = create();
  assert.equal(restarted.getStatus().used, 1);
  await restarted.reserveRequest();
  assert.equal(restarted.getStatus().remaining, 0);
  await assert.rejects(restarted.reserveRequest(), /local Gemini daily safety budget/i);
});

test('OTP emails are skipped without contacting Gemini or exposing the email body', async () => {
  const ignored = [];
  let attempted = 0;
  const service = loadWithStubs(path.join(root, 'src/services/sync.service.js'), {
    './google/gmail.service': { getMessages: async () => [
      { title: 'OTP for email verification', source: 'gmail', sourceId: 'secret', occurredAt: new Date().toISOString() },
      { title: 'Scholarship registration deadline', source: 'gmail', sourceId: 'real', occurredAt: new Date().toISOString() },
    ] },
    './google/classroom.service': { getCourses: async () => [] },
    './ingestion/normalizer': {
      normalizeGmailMessage: (x) => x, normalizeClassroomAnnouncement: (x) => x,
      normalizeClassroomCourseWork: (x) => x,
    },
    './decision/pipeline.service': {
      runPipeline: async (item) => { attempted++; assert.equal(item.sourceId, 'real'); return { ...item }; },
      ItemIgnoredError: class ItemIgnoredError extends Error {},
    },
    './task.service': {
      findExistingSourceKeys: async () => new Set(), backfillSourceDates: async () => {},
      rememberIgnoredSource: async (_, item, reason) => ignored.push([item.sourceId, reason]),
      createTaskIfNotExists: async (_, item) => ({ created: true, task: item }),
    },
    './realtime/socket.service': { notifyTaskCreated: () => {} },
    './ai/llm.service': { assertAiConfigured: () => {} },
    '../utils/syncWindow': syncWindow,
    '../utils/ApiError': ApiError,
  });
  const summary = await service.syncUserTasks({ id: 'u' }, { includeClassroom: false });
  assert.equal(summary.ignored, 1);
  assert.equal(attempted, 1);
  assert.equal(summary.created, 1);
  assert.deepEqual(ignored, [['secret', 'credential_notice']]);
});

test('Gemini daily budget resets at midnight Pacific time, including daylight savings', () => {
  let state;
  const fakeFs = {
    readFileSync: () => { if (!state) throw Error('missing'); return state; },
    mkdirSync: () => {}, writeFileSync: (_p, value) => { state = value; },
  };
  const quota = loadWithStubs(path.join(root, 'src/services/ai/geminiQuota.js'), {
    'node:fs': fakeFs, 'node:path': path,
    '../../config/env': {
      GEMINI_MODEL: 'a', GEMINI_DAILY_REQUEST_BUDGET: 1,
      GEMINI_MAX_REQUESTS_PER_MINUTE: 4, GEMINI_MIN_REQUEST_INTERVAL_MS: 0,
    },
  });
  assert.notEqual(quota.pacificDay(Date.parse('2026-11-18T07:59:59Z')),
    quota.pacificDay(Date.parse('2026-11-18T08:00:00Z')));
  assert.notEqual(quota.pacificDay(Date.parse('2026-07-18T06:59:59Z')),
    quota.pacificDay(Date.parse('2026-07-18T07:00:00Z')));
});
