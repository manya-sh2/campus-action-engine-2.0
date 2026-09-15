const { Server } = require('socket.io');
const cookie = require('cookie');
const env = require('../../config/env');
const authService = require('../auth.service');
const taskService = require('../task.service');

// This module owns the Socket.IO server instance and is the ONLY place
// that talks to it. It authenticates connections using the EXACT SAME
// session mechanism as the REST API (authService.verifySession) - no
// separate auth scheme - and keeps handlers free of business logic by
// delegating every state change to the existing task.service.js.

let io = null;

function roomForUser(userId) {
  return `user:${String(userId)}`;
}

/**
 * Whitelists exactly the fields a client should see for a task event.
 * Centralizing this in one place means every emit path (sync, cron,
 * REST-triggered completion, socket-triggered completion) sends the
 * same shape and can never accidentally leak internal/sensitive fields
 * (not that Task ever stores any - but this keeps the payload minimal
 * and stable regardless of what gets added to the Task model later).
 */
function toTaskPayload(task) {
  return {
    id: task._id,
    source: task.source,
    category: task.category,
    title: task.title,
    organization: task.organization,
    deadline: task.deadline,
    actionRequired: task.actionRequired,
    actionUrl: task.actionUrl,
    isEligible: task.isEligible,
    importanceScore: task.importanceScore,
    urgencyScore: task.urgencyScore,
    priorityScore: task.priorityScore,
    priorityLevel: task.priorityLevel,
    status: task.status,
  };
}

/**
 * Initializes Socket.IO on top of the given HTTP server. Call once from
 * server.js after the HTTP server is created but before it starts
 * listening.
 */
function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
  });

  // Every connecting socket must present the same session cookie the
  // REST API uses. A userId cannot be supplied by the client - identity
  // comes only from the verified session, exactly like requireAuth.
  io.use(async (socket, next) => {
    try {
      const rawCookieHeader = socket.handshake.headers.cookie;
      const parsedCookies = rawCookieHeader ? cookie.parse(rawCookieHeader) : {};
      const rawToken = parsedCookies[env.SESSION_COOKIE_NAME];

      const user = await authService.verifySession(rawToken);
      if (!user) {
        return next(new Error('Unauthorized'));
      }

      socket.user = user;
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Each user only ever joins their OWN private room, so
    // io.to(roomForUser(x)) can never reach a different user's socket.
    socket.join(roomForUser(socket.user._id));

    // The only inbound event this server currently accepts. It contains
    // NO business logic itself - it validates nothing beyond what
    // taskService.updateTaskStatus already validates, and delegates the
    // actual state change entirely to the existing service layer (the
    // same function the REST PATCH endpoint and the MCP
    // mark_task_complete tool call). This fulfills "reuse the same
    // operation from REST, Socket.IO, and MCP."
    socket.on('task:mark_complete', async (payload, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      try {
        const taskId = payload && payload.taskId;
        const task = await taskService.updateTaskStatus(socket.user.id, taskId, 'completed');
        notifyTaskCompleted(socket.user._id, task);
        respond({ success: true, data: toTaskPayload(task) });
      } catch (err) {
        respond({ success: false, message: err.message });
      }
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(roomForUser(userId)).emit(event, payload);
}

/**
 * Emitted when the Phase 3 pipeline creates a new task that's already
 * important (critical/high priority) - not for every single task, to
 * avoid noisy low-signal spam.
 */
function notifyTaskCreated(userId, task) {
  emitToUser(userId, 'task:created', { task: toTaskPayload(task) });
}

/**
 * Emitted by the deadline cron job when a task's priority level
 * actually changes (e.g. medium -> critical as a deadline approaches).
 */
function notifyTaskPriorityUpdated(userId, task, previousLevel) {
  emitToUser(userId, 'task:priority_updated', { task: toTaskPayload(task), previousLevel });
}

/**
 * Emitted whenever a task is marked completed, regardless of whether
 * the request came from REST, the socket itself, or MCP.
 */
function notifyTaskCompleted(userId, task) {
  emitToUser(userId, 'task:completed', { task: toTaskPayload(task) });
}

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  notifyTaskCreated,
  notifyTaskPriorityUpdated,
  notifyTaskCompleted,
  toTaskPayload,
  roomForUser,
};
