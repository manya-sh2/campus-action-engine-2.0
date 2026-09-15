const Task = require('../models/Task');
const ApiError = require('../utils/ApiError');
const { scoreUrgency } = require('./decision/urgency.service');
const { computePriority } = require('./decision/priority.service');

const DUPLICATE_KEY_CODE = 11000;
const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'dismissed'];
const IMPORTANCE_REASON_PREFIX = '[Importance] ';

/**
 * Persists a scored task candidate for a user, skipping (not erroring)
 * if one already exists for the same userId+source+sourceId.
 * @returns {{ created: boolean, task: object }}
 */
async function createTaskIfNotExists(userId, candidate) {
  const existing = await Task.findOne({ userId, source: candidate.source, sourceId: candidate.sourceId });
  if (existing) {
    return { created: false, task: existing };
  }

  try {
    const task = await Task.create({ userId, ...candidate });
    return { created: true, task };
  } catch (err) {
    // Backstop against a race between the pre-check above and the
    // insert (defense in depth around the model's unique index) - not
    // the primary duplicate-prevention mechanism.
    if (err.code === DUPLICATE_KEY_CODE) {
      const existingAfterRace = await Task.findOne({ userId, source: candidate.source, sourceId: candidate.sourceId });
      return { created: false, task: existingAfterRace };
    }
    throw err;
  }
}

function buildFilter(userId, { status, category, priorityLevel, minPriority } = {}) {
  const filter = {
    userId,
    $or: [
      { deadline: null },
      { deadline: { $gt: new Date() } },
    ],
  };
  if (status) filter.status = status;
  if (category) {
    const categories = Array.isArray(category) ? category : String(category).split(',').map((s) => s.trim());
    filter.category = categories.length > 1 ? { $in: categories } : categories[0];
  }
  if (priorityLevel) {
    const levels = Array.isArray(priorityLevel) ? priorityLevel : String(priorityLevel).split(',').map((s) => s.trim());
    filter.priorityLevel = { $in: levels };
  }
  if (minPriority !== undefined && minPriority !== null && !Number.isNaN(Number(minPriority))) {
    filter.priorityScore = { $gte: Number(minPriority) };
  }
  return filter;
}

const SORT_FIELDS = new Set(['priorityScore', 'urgencyScore', 'importanceScore', 'deadline', 'createdAt']);

/**
 * Lists a user's tasks with filtering, sorting, and pagination.
 */
async function listTasks(userId, options = {}) {
  const { page = 1, limit = 20, sortBy = 'priorityScore', sortOrder = 'desc' } = options;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safeSortBy = SORT_FIELDS.has(sortBy) ? sortBy : 'priorityScore';
  const safeSortOrder = sortOrder === 'asc' ? 1 : -1;

  const filter = buildFilter(userId, options);

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort({ [safeSortBy]: safeSortOrder })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Task.countDocuments(filter),
  ]);

  return {
    tasks,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 0,
    },
  };
}

/**
 * Convenience query for the "what needs my attention" view.
 */
async function getHighPriorityTasks(userId) {
  return Task.find({
    userId,
    priorityLevel: { $in: ['critical', 'high'] },
    $or: [
      { deadline: null },
      { deadline: { $gt: new Date() } },
    ],
  }).sort({ priorityScore: -1 });
}

/**
 * Fetches a single task, scoped to its owner. Filtering by userId in
 * the same query (rather than fetching by id and checking ownership
 * after) means a task belonging to another user looks identical to a
 * nonexistent one - never trust a taskId alone for authorization.
 */
async function getTaskById(userId, taskId) {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) {
    throw ApiError.notFound(`Task with id '${taskId}' not found`);
  }
  return task;
}

/**
 * Updates a task's status. This is the ONLY place status transitions
 * happen - REST (PATCH /api/tasks/:taskId/status), the Socket.IO
 * `task:mark_complete` handler, and the MCP `mark_task_complete` tool
 * all call this exact function, so status logic is never duplicated.
 * Ownership is enforced the same way as getTaskById.
 */
async function updateTaskStatus(userId, taskId, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const task = await Task.findOneAndUpdate({ _id: taskId, userId }, { status }, { new: true, runValidators: true });
  if (!task) {
    throw ApiError.notFound(`Task with id '${taskId}' not found`);
  }
  return task;
}

/**
 * Finds pending tasks with a deadline that's either already passed or
 * within `withinDays` - the candidate set the deadline cron job needs
 * to re-check. Bounding by `withinDays` avoids re-scanning tasks whose
 * deadline is so far out their urgency bucket couldn't possibly have
 * changed yet. Populates `userId` since urgency recalculation needs the
 * student's timezone.
 */
async function findPendingTasksWithDeadlines({ withinDays = 31 } = {}) {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  return Task.find({
    status: 'pending',
    deadline: { $ne: null, $lte: cutoff },
  }).populate('userId');
}

/**
 * Recalculates a task's urgency/priority as time passes, reusing the
 * EXACT same decision engines the original pipeline used (no duplicated
 * scoring math). Importance never changes after creation (it depends on
 * eligibility/category/skills, not time), so its score and reasons are
 * carried forward unchanged; only urgency and the combined priority are
 * recomputed.
 *
 * Persists and returns `changed: true` only if the recomputed values
 * actually differ from what's stored, so callers (the cron job) can
 * skip both the write and any notification when nothing meaningful
 * happened - this is the mechanism that prevents duplicate
 * notifications and unnecessary writes on every cron tick.
 *
 * @param {object} task - a Task document (from findPendingTasksWithDeadlines)
 * @param {object} user - the task owner's User document (task.userId, populated)
 */
async function recalculateUrgency(task, user) {
  const urgencyResult = scoreUrgency({
    extraction: { deadline: task.deadline ? task.deadline.toISOString() : null },
    user,
  });

  const importanceReasons = (task.priorityReasons || [])
    .filter((r) => r.startsWith(IMPORTANCE_REASON_PREFIX))
    .map((r) => r.slice(IMPORTANCE_REASON_PREFIX.length));

  const priorityResult = computePriority({
    importance: { score: task.importanceScore, reasons: importanceReasons },
    urgency: urgencyResult,
  });

  const changed = urgencyResult.score !== task.urgencyScore || priorityResult.level !== task.priorityLevel;
  const previousLevel = task.priorityLevel;

  if (!changed) {
    return { task, changed: false, previousLevel };
  }

  task.urgencyScore = urgencyResult.score;
  task.priorityScore = priorityResult.score;
  task.priorityLevel = priorityResult.level;
  task.priorityReasons = priorityResult.reasons;
  await task.save();

  return { task, changed: true, previousLevel };
}

/**
 * Convenience query for "what's due soon" - pending tasks with a
 * deadline within the next `withinDays`, soonest first. Reused by the
 * `get_upcoming_deadlines` MCP tool (and available for a future REST
 * endpoint without duplicating this query elsewhere).
 */
async function getUpcomingDeadlines(userId, { withinDays = 14 } = {}) {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  return Task.find({
    userId,
    status: 'pending',
    deadline: {
      $gt: new Date(),
      $lte: cutoff,
    },
  }).sort({ deadline: 1 });
}

module.exports = {
  createTaskIfNotExists,
  listTasks,
  getHighPriorityTasks,
  getTaskById,
  getUpcomingDeadlines,
  updateTaskStatus,
  findPendingTasksWithDeadlines,
  recalculateUrgency,
};
