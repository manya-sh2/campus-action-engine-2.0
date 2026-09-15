const cron = require('node-cron');
const env = require('../../config/env');
const taskService = require('../task.service');
const realtimeService = require('../realtime/socket.service');

// A task's priority level is only considered worth a real-time
// notification once it reaches this set - matches the same threshold
// used for GET /api/tasks/priority/high and the sync-time "important
// task created" notification, so the definition of "important" is
// consistent everywhere in the app.
const IMPORTANT_LEVELS = ['critical', 'high'];

/**
 * Re-checks every pending task with an approaching/overdue deadline and
 * recalculates urgency/priority via task.service.recalculateUrgency
 * (which reuses the exact same decision engines the original pipeline
 * used - no scoring logic is duplicated here). A failure on one task
 * never aborts the rest of the run, matching the same reliability
 * pattern used by the Phase 3 sync pipeline.
 *
 * Only writes to the database and emits a notification when the
 * recomputed values actually differ from what's stored - this is what
 * prevents duplicate notifications and unnecessary writes across
 * repeated cron ticks for tasks whose urgency bucket hasn't changed.
 */
async function runDeadlineCheck() {
  const summary = { checked: 0, updated: 0, notified: 0, failed: 0, errors: [] };

  const tasks = await taskService.findPendingTasksWithDeadlines();

  for (const task of tasks) {
    summary.checked += 1;
    try {
      const user = task.userId; // populated by findPendingTasksWithDeadlines
      if (!user) continue;

      const { changed, previousLevel } = await taskService.recalculateUrgency(task, user);

      if (changed) {
        summary.updated += 1;

        if (IMPORTANT_LEVELS.includes(task.priorityLevel) && task.priorityLevel !== previousLevel) {
          realtimeService.notifyTaskPriorityUpdated(user._id, task, previousLevel);
          summary.notified += 1;
        }
      }
    } catch (err) {
      summary.failed += 1;
      summary.errors.push({ taskId: task._id, reason: err.message });
      console.error('[cron] Failed to recalculate urgency for task', task._id, '-', err.message);
    }
  }

  return summary;
}

let scheduledTask = null;

/**
 * Starts the recurring deadline-check job. Call once from server.js.
 * No-ops (and logs why) if ENABLE_DEADLINE_CRON is false.
 */
function startDeadlineCron() {
  if (!env.ENABLE_DEADLINE_CRON) {
    console.log('[cron] Deadline cron is disabled (ENABLE_DEADLINE_CRON=false).');
    return null;
  }

  scheduledTask = cron.schedule(env.DEADLINE_CRON_SCHEDULE, () => {
    runDeadlineCheck()
      .then((summary) => {
        if (summary.updated > 0 || summary.failed > 0) {
          console.log(
            `[cron] Deadline check: checked=${summary.checked} updated=${summary.updated} notified=${summary.notified} failed=${summary.failed}`
          );
        }
      })
      .catch((err) => console.error('[cron] Deadline check run failed:', err.message));
  });

  console.log(`[cron] Deadline cron scheduled: "${env.DEADLINE_CRON_SCHEDULE}"`);
  return scheduledTask;
}

function stopDeadlineCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = { startDeadlineCron, stopDeadlineCron, runDeadlineCheck };
