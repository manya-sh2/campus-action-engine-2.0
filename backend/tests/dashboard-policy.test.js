const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { visibleTaskFilter } = require('../src/utils/syncWindow');

function load(relative, stubs = {}, consoleStub = console) {
  const filename = path.resolve(__dirname, '../src', relative);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  const fn = vm.runInNewContext('(function(require,module,exports){' + fs.readFileSync(filename, 'utf8') + '\n})',
    { Date, console: consoleStub }, { filename });
  fn((name) => Object.hasOwn(stubs, name) ? stubs[name] : nativeRequire(name), module, module.exports);
  return module.exports;
}
const future = () => new Date(Date.now() + 86400000).toISOString();
const recent = () => new Date(Date.now() - 86400000).toISOString();
const raw = (changes = {}) => ({
  classification: 'ACTION_REQUIRED', ignoreReason: null, category: 'job',
  title: 'Graduate recruitment application', organization: 'Example employer',
  description: 'Apply for graduate recruitment.',
  eligibility: { branches: [], minCgpa: null, graduationYears: [] },
  skills: [], deadline: future(), actionRequired: 'Apply', actionUrl: null,
  confidence: 0.9, ...changes,
});
const item = () => ({ source: 'gmail', sourceId: 'source-1', sourceType: 'email', occurredAt: recent() });
const user = { timezone: 'Asia/Kolkata', branch: 'Mining', cgpa: 8, graduationYear: 2027 };
const pipeline = load('services/decision/pipeline.service.js', {
  '../ai/llm.service': { extractStructuredInfo: async () => { throw new Error('Unexpected AI request'); } },
});

test('real pipeline rejects event/club/other categories even when Gemini calls them actionable', async () => {
  for (const category of ['event', 'scholarship', 'registration', 'announcement', 'other']) {
    await assert.rejects(pipeline.runPipeline(item(), user, raw({ category })),
      (err) => err.ignoreReason === 'out_of_scope');
  }
});

test('jobs, internships, semester exams and dated assignments survive the real scoring pipeline', async () => {
  for (const category of ['job', 'internship', 'exam', 'assignment']) {
    const task = await pipeline.runPipeline(item(), user, raw({ category }));
    assert.equal(task.category, category);
    assert.ok(task.deadline > new Date());
    assert.equal(task.priorityScore, Math.round(task.importanceScore * 0.6 + task.urgencyScore * 0.4));
    assert.match(task.priorityReasons[0], /priority = importance/);
  }
});

test('past deadline and undated assignment cannot become saved candidates', async () => {
  await assert.rejects(pipeline.runPipeline(item(), user, raw({ deadline: recent() })), (err) => err.ignoreReason === 'past_deadline');
  await assert.rejects(pipeline.runPipeline(item(), user, raw({ category: 'assignment', deadline: null })), (err) => err.ignoreReason === 'missing_deadline');
  const job = await pipeline.runPipeline(item(), user, raw({ deadline: null }));
  assert.equal(job.deadline, null);
});

test('Classroom deadline overrides a false future date from AI', async () => {
  await assert.rejects(pipeline.runPipeline({ ...item(), sourceDeadline: recent() }, user, raw({ category: 'assignment' })),
    (err) => err.ignoreReason === 'past_deadline');
  const deadline = future();
  const task = await pipeline.runPipeline({ ...item(), sourceDeadline: deadline }, user, raw({ category: 'assignment', deadline: null }));
  assert.equal(task.deadline.toISOString(), deadline);
});

test('date-only deadlines resolve to local end of day and explicit eligibility still gates jobs', async () => {
  const task = await pipeline.runPipeline(item(), user, raw({ deadline: '2099-01-01' }));
  assert.equal(task.deadline.toISOString(), '2099-01-01T18:29:59.999Z');
  await assert.rejects(pipeline.runPipeline(item(), user, raw({ eligibility: { branches: [], minCgpa: 9, graduationYears: [] } })),
    (err) => err.ignoreReason === 'ineligible_opportunity');
});

// Evaluate the query operators exercised here against representative saved
// records, without a MongoDB server or modifying the user's database.
function matches(doc, query) {
  return Object.entries(query).every(([field, expected]) => {
    if (field === '$and') return expected.every((q) => matches(doc, q));
    if (field === '$or') return expected.some((q) => matches(doc, q));
    const actual = doc[field];
    if (expected === null) return actual == null;
    if (typeof expected !== 'object' || expected instanceof Date) return actual === expected;
    return Object.entries(expected).every(([operator, value]) => {
      if (operator === '$in') return value.includes(actual);
      if (operator === '$ne') return actual !== value;
      if (operator === '$gt') return actual != null && actual > value;
      if (operator === '$gte') return actual != null && actual >= value;
      if (operator === '$lte') return actual != null && actual <= value;
      throw new Error(`Unsupported test query operator: ${operator}`);
    });
  });
}
function saved(changes = {}) {
  return { userId: 'u', sourceOccurredAt: new Date(recent()), category: 'job',
    status: 'pending', deadline: new Date(future()), priorityLevel: 'high', priorityScore: 70, ...changes };
}
function taskService(records) {
  return load('services/task.service.js', {
    '../models/ProcessedSource': {},
    '../models/Task': {
      countDocuments: async (query) => records.filter((d) => matches(d, query)).length,
      find(query) {
        let rows = records.filter((d) => matches(d, query));
        const chain = {
          sort(order) {
            const [key, direction] = Object.entries(order)[0];
            rows.sort((a, b) => {
              const left = a[key] ?? 0, right = b[key] ?? 0;
              return (left < right ? -1 : left > right ? 1 : 0) * direction;
            });
            return chain;
          },
          skip(n) { rows = rows.slice(n); return chain; },
          limit(n) { rows = rows.slice(0, n); return chain; },
          populate() { return chain; },
          then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
        };
        return chain;
      },
    },
  });
}

test('saved old events, old sources, expired tasks and undated assignments stay hidden', () => {
  const filter = visibleTaskFilter();
  for (const bad of [saved({ category: 'event' }), saved({ category: 'assignment', deadline: null }),
    saved({ deadline: new Date(recent()) }), saved({ sourceOccurredAt: new Date(Date.now() - 31 * 86400000) })]) {
    assert.equal(matches(bad, filter), false);
  }
  assert.equal(matches(saved(), filter), true);
});

test('completed/dismissed records disappear from high priority and deadline/cron queries', async () => {
  const records = ['pending', 'in_progress', 'completed', 'dismissed'].map((status) => saved({ status }));
  records.push(saved({ category: 'event' }), saved({ userId: 'another-user' }));
  const service = taskService(records);
  for (const rows of [await service.getHighPriorityTasks('u'), await service.getUpcomingDeadlines('u')]) {
    assert.deepEqual(rows.map((d) => d.status).sort(), ['in_progress', 'pending']);
    assert.ok(rows.every((d) => d.userId === 'u'));
  }
  const cron = await service.findPendingTasksWithDeadlines();
  assert.ok(cron.every((d) => ['pending', 'in_progress'].includes(d.status) && d.category === 'job'));
});

test('undated records do not crowd out upcoming deadlines before pagination', async () => {
  const records = Array.from({ length: 12 }, () => saved({ deadline: null }));
  records.push(saved({ title: 'Actual upcoming interview' }));
  const { tasks, pagination } = await taskService(records).listTasks('u', {
    status: 'active', hasDeadline: true, sortBy: 'deadline', sortOrder: 'asc', limit: 10,
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Actual upcoming interview');
  assert.equal(pagination.total, 1);
});

test('category query cannot bypass scope; history filters still allow relevant completed tasks', async () => {
  const service = taskService([saved({ category: 'event' }), saved({ status: 'completed' }), saved()]);
  assert.equal((await service.listTasks('u', { category: 'event' })).tasks.length, 0);
  assert.equal((await service.listTasks('u', { status: 'completed' })).tasks.length, 1);
  assert.equal((await service.listTasks('u', { status: 'active' })).tasks.length, 1);
});

test('terminal logging excludes email bodies, headers, keys and raw errors', () => {
  const lines = [];
  const logger = load('utils/logger.js', {}, { log: (line) => lines.push(line) });
  logger.log('sync.finished', { created: 2, ignored: 5, body: 'PRIVATE EMAIL',
    apiKey: 'SECRET', headers: { authorization: 'TOKEN' }, error: new Error('SECRET') });
  const record = JSON.parse(lines[0]);
  assert.equal(record.created, 2);
  assert.equal(record.ignored, 5);
  assert.ok(!/PRIVATE|SECRET|TOKEN/.test(lines[0]));
  assert.ok(record.time);
});

test('loaded frontend cards expire locally at the deadline and reject old events', async () => {
  const { isTaskVisible } = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/taskVisibility.js')));
  const task = saved();
  const now = Date.now();
  assert.equal(isTaskVisible(task, now), true);
  assert.equal(isTaskVisible(task, task.deadline.getTime()), false);
  assert.equal(isTaskVisible(saved({ category: 'event' }), now), false);
  assert.equal(isTaskVisible(saved({ category: 'assignment', deadline: null }), now), false);
  assert.equal(isTaskVisible(saved({ deadline: null }), now), true);
});
