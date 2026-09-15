const syncService = require('../services/sync.service');
const taskService = require('../services/task.service');
const realtimeService = require('../services/realtime/socket.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

// POST /api/tasks/sync
// Fetches Gmail/Classroom data, runs it through the intelligence
// pipeline, and stores new tasks. Always processes THIS authenticated
// user's own data - req.user comes from the verified session, never
// from the request body.
const syncTasks = asyncHandler(async (req, res) => {
  const body = req.body || {};

  const summary = await syncService.syncUserTasks(req.user, {
    includeGmail: body.includeGmail !== undefined ? Boolean(body.includeGmail) : true,
    includeClassroom: body.includeClassroom !== undefined ? Boolean(body.includeClassroom) : true,
    classroomCourseIds: Array.isArray(body.classroomCourseIds) ? body.classroomCourseIds : undefined,
    gmailQuery: typeof body.gmailQuery === 'string' ? body.gmailQuery : undefined,
    gmailMaxResults: body.gmailMaxResults ? Number(body.gmailMaxResults) : undefined,
  });

  sendSuccess(res, { message: 'Sync complete', data: summary });
});

// GET /api/tasks
// Supports filtering (status, category, priorityLevel, minPriority),
// sorting (sortBy, sortOrder), and pagination (page, limit).
const listTasks = asyncHandler(async (req, res) => {
  const { status, category, priorityLevel, minPriority, page, limit, sortBy, sortOrder } = req.query;

  const { tasks, pagination } = await taskService.listTasks(req.user.id, {
    status,
    category,
    priorityLevel,
    minPriority,
    page,
    limit,
    sortBy,
    sortOrder,
  });

  sendSuccess(res, { data: { tasks, pagination } });
});

// GET /api/tasks/priority/high
// Convenience endpoint for the "what needs my attention" view: critical
// + high priority tasks, sorted by priority score descending.
const getHighPriorityTasks = asyncHandler(async (req, res) => {
  const tasks = await taskService.getHighPriorityTasks(req.user.id);
  sendSuccess(res, { data: tasks });
});

// GET /api/tasks/:taskId
const getTaskById = asyncHandler(async (req, res) => {
  const task = await taskService.getTaskById(req.user.id, req.params.taskId);
  sendSuccess(res, { data: task });
});

// PATCH /api/tasks/:taskId/status
// Body: { "status": "pending" | "in_progress" | "completed" | "dismissed" }
// This is the same underlying operation the Socket.IO `task:mark_complete`
// event and the MCP `mark_task_complete` tool use - status logic itself
// lives only in taskService.updateTaskStatus.
const updateTaskStatus = asyncHandler(async (req, res) => {
  const task = await taskService.updateTaskStatus(req.user.id, req.params.taskId, req.body && req.body.status);

  if (task.status === 'completed') {
    realtimeService.notifyTaskCompleted(req.user.id, task);
  }

  sendSuccess(res, { message: 'Task status updated', data: task });
});

module.exports = { syncTasks, listTasks, getHighPriorityTasks, getTaskById, updateTaskStatus };
