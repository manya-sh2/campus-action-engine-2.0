const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

const userService = require('../services/user.service');
const taskService = require('../services/task.service');
const driveService = require('../services/google/drive.service');
const realtimeService = require('../services/realtime/socket.service');
const ApiError = require('../utils/ApiError');

// ---------------------------------------------------------------------
// ARCHITECTURE: every tool below is a thin adapter.
//
//   AI client -> MCP tool -> EXISTING service -> MongoDB / Google API
//
// No tool re-implements eligibility/importance/urgency/priority scoring,
// duplicate-prevention, ownership checks, or Google API calls - it all
// already exists in services/task.service.js, services/user.service.js,
// and services/google/drive.service.js. A tool's only job is to:
//   1. Validate its own input shape (via the zod inputSchema).
//   2. Call the one existing service function that already does the work.
//   3. Shape the result as MCP tool content.
// ---------------------------------------------------------------------

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // matches the REST Multer limit

function textResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

/** Wraps a tool handler so any thrown error (ApiError or otherwise) becomes an MCP error result instead of crashing the transport. */
function safeTool(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResult(err.message || 'Tool execution failed');
    }
  };
}

/**
 * Whitelists exactly the profile fields an AI client should see -
 * mirrors the same whitelist philosophy used for Socket.IO task
 * payloads. Never includes googleId or any auth-adjacent field.
 */
function toProfilePayload(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    branch: user.branch,
    year: user.year,
    graduationYear: user.graduationYear,
    cgpa: user.cgpa,
    skills: user.skills,
    preferredRoles: user.preferredRoles,
    timezone: user.timezone,
  };
}

/**
 * Builds a fresh McpServer bound to ONE authenticated user for the
 * lifetime of a single request (see routes/mcp.routes.js, which creates
 * one of these per HTTP request in stateless mode). Binding `user` here
 * via closure - rather than accepting a userId argument on each tool -
 * is what makes it structurally impossible for a tool call to act on
 * another user's data: there is no parameter an AI client could set to
 * change whose data is read or written.
 */
function createMcpServerForUser(user) {
  const server = new McpServer({ name: 'campus-action-engine', version: '1.0.0' });

  server.registerTool(
    'get_my_profile',
    {
      title: 'Get my profile',
      description: "Get the authenticated student's own profile (branch, CGPA, graduation year, skills, preferred roles).",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    safeTool(async () => {
      const freshUser = await userService.findUserById(user.id);
      return textResult(toProfilePayload(freshUser));
    })
  );

  server.registerTool(
    'get_urgent_tasks',
    {
      title: 'Get urgent tasks',
      description: 'Get the authenticated student\'s critical and high priority tasks, sorted by priority score descending.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    safeTool(async () => {
      const tasks = await taskService.getHighPriorityTasks(user.id);
      return textResult(tasks.map(realtimeService.toTaskPayload));
    })
  );

  server.registerTool(
    'get_upcoming_deadlines',
    {
      title: 'Get upcoming deadlines',
      description: "Get the authenticated student's pending tasks with a deadline in the next N days (default 14), soonest first.",
      inputSchema: { withinDays: z.number().int().min(1).max(90).optional() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    safeTool(async ({ withinDays }) => {
      const tasks = await taskService.getUpcomingDeadlines(user.id, { withinDays });
      return textResult(tasks.map(realtimeService.toTaskPayload));
    })
  );

  server.registerTool(
    'get_relevant_opportunities',
    {
      title: 'Get relevant opportunities',
      description:
        'Get job/internship/scholarship tasks relevant to the authenticated student, sorted by importance. Optionally filter to only eligible ones.',
      inputSchema: {
        eligibleOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    safeTool(async ({ eligibleOnly, limit }) => {
      const { tasks } = await taskService.listTasks(user.id, {
        category: ['job', 'internship', 'scholarship'],
        sortBy: 'importanceScore',
        sortOrder: 'desc',
        limit: limit || 20,
      });
      const filtered = eligibleOnly ? tasks.filter((t) => t.isEligible) : tasks;
      return textResult(filtered.map(realtimeService.toTaskPayload));
    })
  );

  server.registerTool(
    'get_task_details',
    {
      title: 'Get task details',
      description: 'Get full details (including eligibility and priority reasons) for one of the authenticated student\'s own tasks by id.',
      inputSchema: { taskId: z.string() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    safeTool(async ({ taskId }) => {
      // getTaskById scopes by { _id: taskId, userId: user.id } together,
      // so a taskId belonging to another user 404s exactly like a
      // nonexistent one - it can never be distinguished or read.
      const task = await taskService.getTaskById(user.id, taskId);
      return textResult({
        ...realtimeService.toTaskPayload(task),
        description: task.description,
        skills: task.skills,
        eligibility: task.eligibility,
        eligibilityReasons: task.eligibilityReasons,
        priorityReasons: task.priorityReasons,
        confidence: task.confidence,
        sourceLink: task.sourceLink,
      });
    })
  );

  server.registerTool(
    'search_drive_files',
    {
      title: 'Search Drive files',
      description: "Search the authenticated student's Google Drive files by name (only files this app created or the user opened with it).",
      inputSchema: { query: z.string().optional() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    safeTool(async ({ query }) => {
      const files = await driveService.listFiles(user.id, { q: query });
      return textResult(files);
    })
  );

  server.registerTool(
    'upload_file_to_drive',
    {
      title: 'Upload a file to Drive',
      description:
        'Upload a file to the authenticated student\'s Google Drive. This is a WRITE action: the caller must set confirm=true, ' +
        'and fileContentBase64 must be the base64-encoded file content (max 15MB decoded).',
      inputSchema: {
        fileName: z.string(),
        mimeType: z.string(),
        fileContentBase64: z.string(),
        confirm: z.boolean(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    safeTool(async ({ fileName, mimeType, fileContentBase64, confirm }) => {
      if (!confirm) {
        throw ApiError.badRequest(
          'This uploads a real file to the user\'s Google Drive. Re-call this tool with confirm=true to proceed.'
        );
      }

      let buffer;
      try {
        buffer = Buffer.from(fileContentBase64, 'base64');
      } catch (err) {
        throw ApiError.badRequest('fileContentBase64 is not valid base64.');
      }

      if (buffer.length === 0) {
        throw ApiError.badRequest('Decoded file content is empty.');
      }
      if (buffer.length > MAX_UPLOAD_BYTES) {
        throw ApiError.badRequest(`File is too large (${buffer.length} bytes). Maximum is ${MAX_UPLOAD_BYTES} bytes.`);
      }

      // Reuses the exact same driveService.uploadFile the REST Multer
      // route calls - it doesn't know or care whether the bytes came
      // from a multipart form field or a decoded base64 string.
      const uploaded = await driveService.uploadFile(user.id, {
        originalname: fileName,
        mimetype: mimeType,
        buffer,
      });

      return textResult(uploaded);
    })
  );

  server.registerTool(
    'mark_task_complete',
    {
      title: 'Mark task complete',
      description:
        'Mark one of the authenticated student\'s own tasks as completed. This is a WRITE action: the caller must set confirm=true.',
      inputSchema: { taskId: z.string(), confirm: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    safeTool(async ({ taskId, confirm }) => {
      if (!confirm) {
        throw ApiError.badRequest('This marks a real task as completed. Re-call this tool with confirm=true to proceed.');
      }

      // Same taskService.updateTaskStatus used by the REST PATCH
      // endpoint and the Socket.IO task:mark_complete handler - status
      // logic is never duplicated.
      const task = await taskService.updateTaskStatus(user.id, taskId, 'completed');
      realtimeService.notifyTaskCompleted(user.id, task);

      return textResult(realtimeService.toTaskPayload(task));
    })
  );

  return server;
}

module.exports = { createMcpServerForUser };
