// One rolling 30-day window for Gmail, Classroom, sync, and saved-task views.
// Do not use MongoDB createdAt as an email's age: an old email can be synced today.
const LOOKBACK_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Placement recruitment updates use job/internship; semester notices use exam.
// Keep this gate at both ingestion and query time, including legacy tasks.
const IMPORTANT_CATEGORIES = ['job', 'internship', 'assignment', 'exam'];

function cutoffDate(now = Date.now()) {
  return new Date(new Date(now).getTime() - LOOKBACK_DAYS * MS_PER_DAY);
}

function isWithinSyncWindow(date, now = Date.now()) {
  if (!date) return false;
  const time = new Date(date).getTime();
  const nowMs = new Date(now).getTime();
  return Number.isFinite(time) && time >= cutoffDate(nowMs).getTime() && time <= nowMs;
}

function isPastDeadline(date, now = Date.now()) {
  if (!date) return false;
  const time = new Date(date).getTime();
  return Number.isFinite(time) && time <= new Date(now).getTime();
}

// Visibility is applied at the database layer to list, priority, and MCP
// queries, including legacy records saved by older versions of the app.
// Legacy records without a source timestamp stay stored but hidden until
// a new sync safely backfills their original Gmail/Classroom timestamp.
function visibleTaskFilter(now = new Date()) {
  const reference = new Date(now);
  return {
    sourceOccurredAt: { $gte: cutoffDate(reference), $lte: reference },
    $or: [{ deadline: null }, { deadline: { $gt: reference } }],
    $and: [
      { category: { $in: IMPORTANT_CATEGORIES } },
      { $or: [{ category: { $ne: 'assignment' } }, { deadline: { $gt: reference } }] },
    ],
  };
}

module.exports = { LOOKBACK_DAYS, IMPORTANT_CATEGORIES, cutoffDate, isWithinSyncWindow, isPastDeadline, visibleTaskFilter };
