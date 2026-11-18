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
const { assertAiConfigured, extractBatchStructuredInfo, getQuotaStatus, getSyncLimits } = require('./ai/llm.service');
const ApiError = require('../utils/ApiError');
const { randomUUID } = require('node:crypto');
const { log } = require('../utils/logger');
const { LOOKBACK_DAYS, isWithinSyncWindow, isPastDeadline } = require('../utils/syncWindow');

const DEFAULT_GMAIL_MAX_RESULTS = 100;
// If the caller doesn't specify which Classroom courses to sync, pull
// from at most this many active courses to keep a single sync request
// bounded (each course means extra Classroom API calls).
const MAX_AUTO_COURSES = 5;
// A newly-created task only gets a real-time push if it's already this
// important - matches the same threshold used by GET /api/tasks/priority/high
// and the deadline cron job, so "important" means the same thing everywhere.
const IMPORTANT_LEVELS = ['critical', 'high'];

// OTP/passcode emails are credentials, not campus tasks. Don't send them to
// an external AI provider or consume free-tier calls on them.
function isCredentialNotice(item) {
  return item.source === 'gmail' &&
    /\b(?:otp|one[ -]?time (?:pass(?:word|code)|code)|verification code|security code)\b/i.test(item.title || '');
}


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
 * Invalid individual extraction results are counted as failures. A provider
 * overload/quota error pauses the sync and defers unprocessed messages.
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
// Only one sync per account at a time on this backend process. Prevents
// double-clicks and duplicate requests from consuming the same free quota.
const activeUserSyncs = new Set();
async function syncUserTasks(user, options = {}) {
  const key = String(user._id || user.id);
  if (activeUserSyncs.has(key)) {
    throw ApiError.conflict('A sync is already running for this account. Finish that sync before starting another.');
  }
  activeUserSyncs.add(key);
  const syncId = randomUUID();
  const started = Date.now();
  log('sync.started', { syncId });
  try {
    const summary = await runSync(user, options, syncId);
    log(summary.stoppedReason ? 'sync.paused' : 'sync.finished', {
      syncId, ...summary, remaining: summary.quota?.remaining,
      budget: summary.quota?.budget, durationMs: Date.now() - started,
    }, summary.stoppedReason || summary.failed || summary.errors.length ? 'warn' : 'info');
    return summary;
  } catch (err) {
    log('sync.failed', { syncId, status: err.statusCode || 500, durationMs: Date.now() - started }, 'error');
    throw err;
  }
  finally { activeUserSyncs.delete(key); }
}

async function runSync(user, options = {}, syncId) {
  const {
    includeGmail = true,
    includeClassroom = true,
    classroomCourseIds,
    gmailQuery,
    gmailMaxResults,
  } = options;

  // Fail with ONE clear error if AI is not configured, instead of
  // fetching data and generating the same error for every message.
  if (includeGmail || includeClassroom) {
    assertAiConfigured();
  }

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
      log('sync.fetch_failed', { syncId, provider: 'gmail', status: err.statusCode || 0 }, 'warn');
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
          log('sync.fetch_failed', { syncId, provider: 'classroom', status: err.statusCode || 0 }, 'warn');
        }
      }
    } catch (err) {
      fetchErrors.push({ source: 'classroom', reason: err.message });
      log('sync.fetch_failed', { syncId, provider: 'classroom', status: err.statusCode || 0 }, 'warn');
    }
  }

  // Apply the policy again here even if a Google API, mock or caller
  // returns an out-of-window item. This avoids sending old mail to Gemini.
  const currentItems = normalizedItems.filter((item) => isWithinSyncWindow(item.occurredAt))
    .map((item) => ({ ...item, timezone: user.timezone || 'Asia/Kolkata' }));
  log('sync.fetched', { syncId, fetched: normalizedItems.length, outOfWindow: normalizedItems.length - currentItems.length });
  const summary = {
    fetched: normalizedItems.length,
    created: 0,
    duplicates: 0,
    ignored: 0,
    outOfWindow: normalizedItems.length - currentItems.length,
    expired: 0,
    failed: 0,
    errors: [...fetchErrors],
    lookbackDays: LOOKBACK_DAYS,
    processed: 0,
    deferred: 0,
    stoppedReason: null,
    quota: null,
  };

  // Reconcile legacy tasks for recently fetched emails so previously
  // saved data stays useful without showing older, unverified records.
  const userId = user._id || user.id;
  await taskService.backfillSourceDates(userId, currentItems);

  // Free-tier quota is precious. A database query is cheaper than re-sending
  // the same already-saved Gmail/Classroom item to Gemini on every sync.
  const existingKeys = await taskService.findExistingSourceKeys(userId, currentItems);
  const seenKeys = new Set();
  const pending = [];

  // Prefer most recently received items, regardless of whether they came
  // from Gmail or Classroom, so urgent new tasks are surfaced first.
  currentItems.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  for (const item of currentItems) {
    const key = JSON.stringify([item.source, item.sourceId]);
    if (seenKeys.has(key) || existingKeys.has(key)) {
      summary.duplicates += 1;
      continue;
    }
    seenKeys.add(key);
    if (isCredentialNotice(item)) {
      summary.ignored += 1;
      await taskService.rememberIgnoredSource?.(userId, item, 'credential_notice');
      continue;
    }
    if (isPastDeadline(item.sourceDeadline)) {
      summary.expired += 1;
      await taskService.rememberIgnoredSource?.(userId, item, 'past_deadline');
      continue;
    }
    pending.push(item);
  }

  const limits = typeof getSyncLimits === 'function'
    ? getSyncLimits() : { maxItems: 1000, batchSize: 1 };
  const maxItems = limits.maxItems;
  const batchSize = typeof extractBatchStructuredInfo === 'function' ? limits.batchSize : 1;
  const selected = pending.slice(0, maxItems);
  summary.deferred = pending.length - selected.length;
  log('sync.selected', { syncId, items: selected.length, duplicates: summary.duplicates,
    ignored: summary.ignored, expired: summary.expired, deferred: summary.deferred });

  for (let start = 0; start < selected.length; start += batchSize) {
    const batch = selected.slice(start, start + batchSize);
    log('sync.batch_started', { syncId, batch: Math.floor(start / batchSize) + 1, items: batch.length });
    let extractions = null;
    try {
      if (typeof extractBatchStructuredInfo === 'function') {
        extractions = await extractBatchStructuredInfo(batch);
      }
    } catch (err) {
      if (err.isGlobalSyncFailure) {
        // Not an unrecoverable sync failure. Previous tasks remain saved,
        // and the remaining unprocessed source IDs are fetched on next sync.
        summary.stoppedReason = err.message;
        summary.deferred += selected.length - start;
        break;
      }
      summary.failed += batch.length;
      summary.errors.push({ source: 'AI extraction', reason: err.message });
      log('sync.batch_failed', { syncId, items: batch.length, status: err.statusCode || 0 }, 'warn');
      continue;
    }

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      summary.processed += 1;
      try {
        const candidate = await runPipeline(item, user, extractions?.[i] || null);
        if (isPastDeadline(candidate.deadline)) {
          summary.expired += 1;
          await taskService.rememberIgnoredSource?.(userId, item, 'past_deadline');
          continue;
        }
        const { created, task } = await taskService.createTaskIfNotExists(user._id || user.id, candidate);
        if (created) {
          summary.created += 1;
          if (IMPORTANT_LEVELS.includes(task.priorityLevel)) {
            realtimeService.notifyTaskCreated(user._id || user.id, task);
          }
        } else {
          summary.duplicates += 1;
        }
      } catch (err) {
        if (err instanceof ItemIgnoredError) {
          if (err.ignoreReason === 'past_deadline') summary.expired += 1;
          else summary.ignored += 1;
          await taskService.rememberIgnoredSource?.(userId, item, err.ignoreReason);
          continue;
        }
        if (err.isGlobalSyncFailure) {
          summary.stoppedReason = err.message;
          summary.deferred += selected.length - start - i;
          break;
        }
        summary.failed += 1;
        log('sync.item_failed', { syncId, status: err.statusCode || 0 }, 'warn');
        summary.errors.push({ source: item.source, sourceId: item.sourceId, title: item.title, reason: err.message });
      }
    }
    log('sync.batch_completed', { syncId, batch: Math.floor(start / batchSize) + 1,
      processed: summary.processed, created: summary.created, ignored: summary.ignored,
      expired: summary.expired, failed: summary.failed });
    if (summary.stoppedReason) break;
  }
  summary.quota = typeof getQuotaStatus === 'function' ? getQuotaStatus() : null;

  return summary;
}

module.exports = { syncUserTasks };
