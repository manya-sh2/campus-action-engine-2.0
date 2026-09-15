const gmailService = require('./google/gmail.service');
const classroomService = require('./google/classroom.service');
const {
  normalizeGmailMessage,
  normalizeClassroomAnnouncement,
  normalizeClassroomCourseWork,
} = require('./ingestion/normalizer');
const { runPipeline, ItemIgnoredError } = require('./decision/pipeline.service');
const taskService = require('./task.service');
const realtimeService = require('./realtime/socket.service');

const DEFAULT_GMAIL_MAX_RESULTS = 15;
// If the caller doesn't specify which Classroom courses to sync, pull
// from at most this many active courses to keep a single sync request
// bounded (each course means extra Classroom API calls).
const MAX_AUTO_COURSES = 5;
// A newly-created task only gets a real-time push if it's already this
// important - matches the same threshold used by GET /api/tasks/priority/high
// and the deadline cron job, so "important" means the same thing everywhere.
const IMPORTANT_LEVELS = ['critical', 'high'];

/**
 * Fetches Gmail + Classroom data for a user using the existing Phase 2
 * Google services, normalizes it into the common ingestion shape, runs
 * each item through the full intelligence pipeline (LLM extraction →
 * classification gate → eligibility gate → importance → urgency →
 * priority), and persists ONLY actionable/important tasks - skipping
 * ones that are irrelevant, ineligible, or already exist.
 *
 * Items that the pipeline rejects as IGNORE (not actionable / ineligible)
 * are counted in `summary.ignored`, never in `summary.failed`.
 * A failure processing ONE item never aborts the rest of the batch.
 *
 * @param {object} user - the authenticated User document (never a
 *   client-supplied id - see task.controller.js)
 * @param {object} [options]
 * @param {boolean} [options.includeGmail=true]
 * @param {boolean} [options.includeClassroom=true]
 * @param {string[]} [options.classroomCourseIds] - defaults to the
 *   user's active courses (capped) if omitted
 * @param {string} [options.gmailQuery] - Gmail search syntax
 * @param {number} [options.gmailMaxResults]
 */
async function syncUserTasks(user, options = {}) {
  const {
    includeGmail = true,
    includeClassroom = true,
    classroomCourseIds,
    gmailQuery,
    gmailMaxResults,
  } = options;

  const normalizedItems = [];
  const fetchErrors = [];

  if (includeGmail) {
    try {
      const messages = await gmailService.getMessages(user.id, {
        q: gmailQuery,
        maxResults: gmailMaxResults || DEFAULT_GMAIL_MAX_RESULTS,
      });
      normalizedItems.push(...messages.map(normalizeGmailMessage));
    } catch (err) {
      // A Gmail fetch failure shouldn't prevent Classroom from being
      // synced (and vice versa) - record it and continue.
      fetchErrors.push({ source: 'gmail', reason: err.message });
    }
  }

  if (includeClassroom) {
    try {
      let courseIds = classroomCourseIds;
      if (!Array.isArray(courseIds) || courseIds.length === 0) {
        const courses = await classroomService.getCourses(user.id);
        courseIds = courses.slice(0, MAX_AUTO_COURSES).map((c) => c.id);
      }

      for (const courseId of courseIds) {
        try {
          const [announcements, courseWork] = await Promise.all([
            classroomService.getAnnouncements(user.id, courseId),
            classroomService.getCourseWork(user.id, courseId),
          ]);
          announcements.forEach((a) => normalizedItems.push(normalizeClassroomAnnouncement(a, courseId)));
          courseWork.forEach((w) => normalizedItems.push(normalizeClassroomCourseWork(w, courseId)));
        } catch (err) {
          fetchErrors.push({ source: 'classroom', courseId, reason: err.message });
        }
      }
    } catch (err) {
      fetchErrors.push({ source: 'classroom', reason: err.message });
    }
  }

  const summary = {
    fetched: normalizedItems.length,
    created: 0,
    duplicates: 0,
    ignored: 0,   // items rejected by the classification/eligibility gate
    failed: 0,
    errors: [...fetchErrors],
  };

  for (const item of normalizedItems) {
    try {
      const candidate = await runPipeline(item, user);

      // Skip tasks whose deadline has already passed (belt-and-suspenders:
      // the mock extractor also catches past-deadline courseWork, but real
      // LLMs may not always set past deadlines correctly in the deadline
      // field — this check is authoritative).
      if (candidate.deadline && new Date(candidate.deadline).getTime() <= Date.now()) {
        summary.ignored += 1;
        continue;
      }

      const { created, task } = await taskService.createTaskIfNotExists(user._id, candidate);
      if (created) {
        summary.created += 1;
        if (IMPORTANT_LEVELS.includes(task.priorityLevel)) {
          realtimeService.notifyTaskCreated(user._id, task);
        }
      } else {
        summary.duplicates += 1;
      }
    } catch (err) {
      // ItemIgnoredError = deliberate rejection (not actionable / ineligible).
      // This is NOT a processing failure — count separately so callers can
      // tell "ignored 5 irrelevant items" from "failed to process 5 items".
      if (err instanceof ItemIgnoredError) {
        summary.ignored += 1;
        // Debug-level log only; this is expected behaviour, not an error.
        if (process.env.NODE_ENV !== 'production') {
          console.debug(
            `[sync] IGNORED [${item.source}/${item.sourceType}] "${item.title}" — ${err.ignoreReason}: ${err.message}`
          );
        }
        continue;
      }

      // Real processing failure
      summary.failed += 1;
      summary.errors.push({
        source: item.source,
        sourceId: item.sourceId,
        title: item.title,
        reason: err.message,
      });
    }
  }

  return summary;
}

module.exports = { syncUserTasks };
