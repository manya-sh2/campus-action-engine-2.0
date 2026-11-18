// Regression tests: run offline with `npm test` (no external credentials).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const windowPolicy = require('../src/utils/syncWindow');
const normalizer = require('../src/services/ingestion/normalizer');

function loadWithStubs(filename, stubs) {
  const code = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith('/logger')) return { log: () => {} };
    if (name === 'node:crypto') return require('node:crypto');
    throw new Error(`Missing test stub for ${name}`);
  };
  const wrapped = vm.runInNewContext('(function(require,module,exports,process){\n' + code + '\n})', { Date, console, Buffer, setTimeout }, { filename });
  wrapped(localRequire, module, module.exports, process);
  return module.exports;
}
function atDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

function makeSync(stubs) {
  return loadWithStubs(path.join(root, 'src/services/sync.service.js'), {
    './google/gmail.service': { getMessages: async () => [] },
    './google/classroom.service': { getCourses: async () => [] },
    './ingestion/normalizer': {
      normalizeGmailMessage: (x) => x,
      normalizeClassroomAnnouncement: (x) => x,
      normalizeClassroomCourseWork: (x) => x,
    },
    './decision/pipeline.service': {
      runPipeline: async (item) => ({ ...item, deadline: null }),
      ItemIgnoredError: class ItemIgnoredError extends Error {},
    },
    './task.service': {
      backfillSourceDates: async () => {},
      findExistingSourceKeys: async () => new Set(),
      createTaskIfNotExists: async (_, candidate) => ({ created: true, task: candidate }),
    },
    './realtime/socket.service': { notifyTaskCreated: () => {} },
    './ai/llm.service': { assertAiConfigured: () => {} },
    '../utils/syncWindow': windowPolicy,
    '../utils/ApiError': require('../src/utils/ApiError'),
    ...stubs,
  });
}

test('30 rolling days: reject old/unknown/future timestamps; accept 29 days and now', () => {
  const now = Date.parse('2026-11-17T18:00:00Z');
  assert.equal(windowPolicy.LOOKBACK_DAYS, 30);
  assert.equal(windowPolicy.cutoffDate(now).toISOString(), '2026-10-18T18:00:00.000Z');
  assert.equal(windowPolicy.isWithinSyncWindow('2026-10-18T18:00:00Z', now), true);
  assert.equal(windowPolicy.isWithinSyncWindow('2026-10-18T17:59:59Z', now), false);
  assert.equal(windowPolicy.isWithinSyncWindow('2026-11-17T18:00:00Z', now), true);
  assert.equal(windowPolicy.isWithinSyncWindow('2026-11-17T18:00:01Z', now), false);
  assert.equal(windowPolicy.isWithinSyncWindow('bogus', now), false);
  assert.equal(windowPolicy.isWithinSyncWindow(undefined, now), false);
});

test('expired and missing deadlines are handled differently', () => {
  const now = '2026-11-17T18:00:00Z';
  assert.equal(windowPolicy.isPastDeadline('2026-11-17T17:59:59Z', now), true);
  assert.equal(windowPolicy.isPastDeadline('2026-11-17T18:00:00Z', now), true);
  assert.equal(windowPolicy.isPastDeadline('2026-11-17T18:00:01Z', now), false);
  assert.equal(windowPolicy.isPastDeadline(null, now), false);
  const filter = windowPolicy.visibleTaskFilter(now);
  assert.equal(filter.sourceOccurredAt.$gte.toISOString(), '2026-10-18T18:00:00.000Z');
  assert.equal(filter.$or[0].deadline, null);
  assert.equal(filter.$or[1].deadline.$gt.toISOString(), '2026-11-17T18:00:00.000Z');
});

test('Classroom creation date is used even if an older post is edited today', () => {
  const today = atDaysAgo(0), old = atDaysAgo(40);
  const announcement = normalizer.normalizeClassroomAnnouncement({ id: 'a', courseId: 'c', creationTime: old, updateTime: today });
  const work = normalizer.normalizeClassroomCourseWork({ id: 'w', courseId: 'c', creationTime: old, updateTime: today, title: 'Work' });
  assert.equal(announcement.occurredAt, old);
  assert.equal(work.occurredAt, old);
  assert.equal(windowPolicy.isWithinSyncWindow(work.occurredAt), false);
});

test('Classroom UTC dueDate/dueTime is authoritative; missing dueTime defaults to 23:59 UTC', () => {
  assert.equal(normalizer.classroomUtcDeadline({ dueDate: { year: 2026, month: 11, day: 18 }, dueTime: { hours: 4, minutes: 30 } }), '2026-11-18T04:30:00.000Z');
  assert.equal(normalizer.classroomUtcDeadline({ dueDate: { year: 2026, month: 11, day: 18 } }), '2026-11-18T23:59:00.000Z');
  assert.equal(normalizer.classroomUtcDeadline({}), null);
  assert.equal(normalizer.classroomUtcDeadline({ dueDate: { year: 2026, month: 2, day: 30 } }), null);
  assert.equal(normalizer.normalizeClassroomCourseWork({ id: 'w', courseId: 'c', title: 'Work', creationTime: atDaysAgo(1), dueDate: { year: 2026, month: 11, day: 18 }, dueTime: { hours: 4, minutes: 30 } }).sourceDeadline, '2026-11-18T04:30:00.000Z');
});

test('Gmail mock returns only recent mail and respects max results', async () => {
  const msgs = [
    { id: 'old', receivedAt: atDaysAgo(32) },
    { id: 'recent', receivedAt: atDaysAgo(1) },
    { id: 'missing' },
    { id: 'recent2', receivedAt: atDaysAgo(2) },
  ];
  const gmail = loadWithStubs(path.join(root, 'src/services/google/gmail.service.js'), {
    googleapis: { google: {} },
    '../../config/env': { GOOGLE_MOCK_MODE: true },
    './oauth.service': {},
    '../../utils/translateGoogleError': (err) => err,
    '../../utils/ApiError': { notFound: () => {} },
    './mock.data': { gmailMessages: msgs },
    '../../utils/syncWindow': windowPolicy,
  });
  assert.deepEqual((await gmail.getMessages('u')).map((m) => m.id), ['recent', 'recent2']);
  assert.deepEqual((await gmail.getMessages('u', { maxResults: 1 })).map((m) => m.id), ['recent']);
});

test('Gmail live API uses newer_than:30d, pagination, and checks actual receive time', async () => {
  const calls = [];
  const fakeGmail = {
    users: { messages: {
      list: async (q) => {
        calls.push(q);
        if (!q.pageToken) return { data: { messages: [{ id: 'old' }], nextPageToken: 'page2' } };
        return { data: { messages: [{ id: 'new' }] } };
      },
      get: async ({ id }) => ({ data: {
        id, payload: { headers: [{ name: 'Subject', value: id }] },
        internalDate: String(Date.parse(atDaysAgo(id === 'old' ? 40 : 1))),
      } }),
    } },
  };
  const gmail = loadWithStubs(path.join(root, 'src/services/google/gmail.service.js'), {
    googleapis: { google: { gmail: () => fakeGmail } },
    '../../config/env': { GOOGLE_MOCK_MODE: false },
    './oauth.service': { getAuthorizedClient: async () => ({}) },
    '../../utils/translateGoogleError': (err) => err,
    '../../utils/ApiError': {},
    './mock.data': {},
    '../../utils/syncWindow': windowPolicy,
  });
  const items = await gmail.getMessages('u', { maxResults: 3 });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'new');
  assert.equal(calls.length, 2);
  assert.match(calls[0].q, /newer_than:30d/);
  assert.equal(calls[1].pageToken, 'page2');
});

test('Classroom mock excludes old announcements and old courseWork even if recently updated', async () => {
  const items = {
    classroomAnnouncements: [
      { id: 'a1', creationTime: atDaysAgo(32), updateTime: atDaysAgo(0) },
      { id: 'a2', creationTime: atDaysAgo(2) },
    ],
    classroomCourseWork: [
      { id: 'w1', creationTime: atDaysAgo(45), updateTime: atDaysAgo(0) },
      { id: 'w2', creationTime: atDaysAgo(3) },
    ],
  };
  const classroom = loadWithStubs(path.join(root, 'src/services/google/classroom.service.js'), {
    googleapis: { google: {} },
    '../../config/env': { GOOGLE_MOCK_MODE: true },
    './oauth.service': {},
    '../../utils/translateGoogleError': (err) => err,
    '../../utils/ApiError': { badRequest: () => {} },
    './mock.data': items,
    '../../utils/syncWindow': windowPolicy,
  });
  assert.deepEqual((await classroom.getAnnouncements('u', 'c')).map((x) => x.id), ['a2']);
  assert.deepEqual((await classroom.getCourseWork('u', 'c')).map((x) => x.id), ['w2']);
});

test('sync never sends old messages or expired Classroom coursework to Gemini', async () => {
  const calls = [];
  let backfilled;
  const items = [
    { source: 'gmail', sourceId: 'old', title: 'old mail', occurredAt: atDaysAgo(40) },
    { source: 'classroom', sourceId: 'expired', title: 'expired coursework', occurredAt: atDaysAgo(1), sourceDeadline: atDaysAgo(1) },
    { source: 'gmail', sourceId: 'pastFromAi', title: 'old deadline', occurredAt: atDaysAgo(2) },
    { source: 'gmail', sourceId: 'active', title: 'current item', occurredAt: atDaysAgo(2) },
  ];
  const sync = makeSync({
    './google/gmail.service': { getMessages: async () => items },
    './decision/pipeline.service': {
      runPipeline: async (item) => {
        calls.push(item.sourceId);
        return { ...item, deadline: item.sourceId === 'pastFromAi' ? atDaysAgo(1) : null };
      },
      ItemIgnoredError: class ItemIgnoredError extends Error {},
    },
    './task.service': {
      backfillSourceDates: async (id, rows) => { backfilled = rows; },
      findExistingSourceKeys: async () => new Set(),
      createTaskIfNotExists: async (_, item) => ({ created: true, task: item }),
    },
  });
  const summary = await sync.syncUserTasks({ id: 'u' }, { includeClassroom: false });
  assert.equal(summary.fetched, 4);
  assert.equal(summary.outOfWindow, 1);
  assert.equal(summary.expired, 2);
  assert.equal(summary.created, 1);
  assert.deepEqual(calls, ['pastFromAi', 'active']);
  assert.equal(backfilled.length, 3);
});

test('existing tasks remain saved, and sync backfills original date only when missing', async () => {
  let writes;
  const taskService = loadWithStubs(path.join(root, 'src/services/task.service.js'), {
    '../models/Task': { bulkWrite: async (ops, opts) => { writes = { ops, opts }; } },
    '../models/ProcessedSource': {},
    '../utils/ApiError': {},
    './decision/urgency.service': {},
    './decision/priority.service': {},
    '../utils/syncWindow': windowPolicy,
  });
  await taskService.backfillSourceDates('u', [
    { source: 'gmail', sourceId: 'x', occurredAt: atDaysAgo(1) },
    { source: 'gmail', sourceId: 'x', occurredAt: atDaysAgo(1) },
  ]);
  assert.equal(writes.ops.length, 1);
  assert.equal(writes.ops[0].updateOne.filter.userId, 'u');
  assert.equal(writes.ops[0].updateOne.filter.sourceOccurredAt, null);
  assert.ok(writes.ops[0].updateOne.update.$set.sourceOccurredAt instanceof Date);
  assert.equal(writes.opts.ordered, false);
});

test('list/high-priority/upcoming queries hide older sources and expired deadlines', async () => {
  const queries = [];
  const fakeTask = {
    find: (query) => {
      queries.push(query);
      const chain = { sort: () => chain, skip: () => chain, limit: async () => [] };
      return chain;
    },
    countDocuments: async () => 0,
  };
  const taskService = loadWithStubs(path.join(root, 'src/services/task.service.js'), {
    '../models/Task': fakeTask,
    '../models/ProcessedSource': {},
    '../utils/ApiError': {},
    './decision/urgency.service': {},
    './decision/priority.service': {},
    '../utils/syncWindow': windowPolicy,
  });
  await taskService.listTasks('u');
  taskService.getHighPriorityTasks('u');
  taskService.getUpcomingDeadlines('u');
  assert.equal(queries.length, 3);
  for (const query of queries) {
    assert.ok(query.sourceOccurredAt.$gte instanceof Date);
    assert.ok(query.sourceOccurredAt.$lte instanceof Date);
    assert.equal(query.userId, 'u');
  }
  assert.ok(queries[0].$or[1].deadline.$gt instanceof Date);
  assert.ok(queries[1].$or[1].deadline.$gt instanceof Date);
  assert.ok(queries[2].deadline.$gt instanceof Date);
});
