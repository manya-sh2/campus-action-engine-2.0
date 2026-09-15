const { resolveDeadline } = require('../../utils/timezone');

// Deterministic, explainable 0-100 "how soon does this need attention"
// score, based purely on time remaining until the deadline. Buckets are
// intentionally coarse and human-readable rather than a continuous
// formula, so the reasoning is easy to explain to the student.

/**
 * @param {object} params
 * @param {object} params.extraction - validated LLM/mock extraction output
 * @param {object} params.user - used for `user.timezone` when resolving
 *   date-only deadlines
 * @returns {{ score: number, reasons: string[], deadline: Date|null }}
 */
function scoreUrgency({ extraction, user }) {
  const deadlineDate = resolveDeadline(extraction.deadline, user && user.timezone);

  if (!deadlineDate) {
    return {
      score: 15,
      reasons: ['No deadline detected - baseline urgency applied'],
      deadline: null,
    };
  }

  const hoursRemaining = (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60);

  let score;
  let reason;

  if (hoursRemaining < 0) {
    score = 100;
    reason = 'Deadline has already passed (overdue)';
  } else if (hoursRemaining <= 24) {
    score = 95;
    reason = 'Deadline is within 24 hours';
  } else if (hoursRemaining <= 72) {
    score = 80;
    reason = 'Deadline is within 3 days';
  } else if (hoursRemaining <= 24 * 7) {
    score = 60;
    reason = 'Deadline is within a week';
  } else if (hoursRemaining <= 24 * 14) {
    score = 40;
    reason = 'Deadline is within two weeks';
  } else if (hoursRemaining <= 24 * 30) {
    score = 25;
    reason = 'Deadline is more than two weeks away';
  } else {
    score = 12;
    reason = 'Deadline is more than a month away';
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons: [reason],
    deadline: deadlineDate,
  };
}

module.exports = { scoreUrgency };
