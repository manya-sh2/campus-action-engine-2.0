const llmService = require('../ai/llm.service');
const validateExtraction = require('../ai/validateExtraction');
const { evaluateEligibility } = require('./eligibility.service');
const { scoreImportance } = require('./importance.service');
const { scoreUrgency } = require('./urgency.service');
const { computePriority } = require('./priority.service');
const ApiError = require('../../utils/ApiError');

// ─────────────────────────────────────────────────────────────────────────────
// Sentinel used by the pipeline to signal "this item was deliberately
// rejected because it is not actionable / not relevant" as distinct from
// a real processing failure. sync.service.js catches this and increments
// an `ignored` counter rather than a `failed` counter. It is intentionally
// NOT a subclass of ApiError so it can never be confused with a transport or
// validation error.
// ─────────────────────────────────────────────────────────────────────────────
class ItemIgnoredError extends Error {
  constructor(reason, ignoreReason) {
    super(reason);
    this.name = 'ItemIgnoredError';
    this.ignoreReason = ignoreReason || 'unspecified';
  }
}

// Categories that represent opportunities a student applies/registers for.
// These get an extra eligibility gate: if the student is definitively
// ineligible (branch mismatch, CGPA not met, wrong graduation year) AND
// the item has explicit criteria, it is rejected before persistence.
const OPPORTUNITY_CATEGORIES = new Set(['job', 'internship', 'scholarship', 'event', 'registration']);

/**
 * Runs a single NormalizedItem through the full intelligence pipeline:
 *   LLM Extraction → Validation → Classification Gate → Eligibility Gate
 *   → Importance → Urgency → Priority
 *
 * Returns a fully-scored candidate object ready to persist as a Task.
 *
 * Throws ItemIgnoredError if the item should not become a task:
 *   - classification === 'IGNORE'
 *   - opportunity categories where the student is definitively ineligible
 *
 * Throws ApiError for genuine processing failures (malformed LLM output,
 * network errors, etc.) — callers (sync.service.js) catch both per-item.
 *
 * @param {object} normalizedItem - see services/ingestion/normalizer.js
 * @param {object} user - the student's profile (User document)
 */
async function runPipeline(normalizedItem, user) {
  const raw = await llmService.extractStructuredInfo(normalizedItem);

  const validationErrors = validateExtraction(raw);
  if (validationErrors.length > 0) {
    throw ApiError.badRequest(`Malformed extraction output: ${validationErrors.join('; ')}`);
  }

  // ── Gate 1: Classification ─────────────────────────────────────────────────
  // The LLM has already classified this item. If it said IGNORE, we stop here.
  // Nothing about this item reaches the database.
  if (raw.classification === 'IGNORE') {
    throw new ItemIgnoredError(
      `Item classified as IGNORE (${raw.ignoreReason || 'unspecified'}): "${raw.title}"`,
      raw.ignoreReason
    );
  }

  // ── Gate 2: Eligibility for opportunities ─────────────────────────────────
  // For items that are opportunities (internship/job/scholarship/event/
  // registration), run the eligibility engine. If the student is definitively
  // ineligible AND there are explicit criteria, reject the item here so it
  // never reaches the DB.
  const eligibilityResult = evaluateEligibility(user, raw);
  if (OPPORTUNITY_CATEGORIES.has(raw.category) && eligibilityResult.hasCriteria && !eligibilityResult.eligible) {
    throw new ItemIgnoredError(
      `Ineligible for opportunity "${raw.title}": ${eligibilityResult.reasons.join('; ')}`,
      'ineligible_opportunity'
    );
  }

  // ── Scoring: Importance → Urgency → Priority ───────────────────────────────
  const importanceResult = scoreImportance({ user, extraction: raw, eligibilityResult });
  const urgencyResult = scoreUrgency({ extraction: raw, user });
  const priorityResult = computePriority({ importance: importanceResult, urgency: urgencyResult });

  return {
    source: normalizedItem.source,
    sourceId: normalizedItem.sourceId,
    sourceType: normalizedItem.sourceType,
    sourceLink: normalizedItem.link,
    courseId: normalizedItem.courseId,

    classification: raw.classification,
    category: raw.category,
    title: raw.title,
    organization: raw.organization,
    description: raw.description,
    skills: raw.skills,
    deadline: urgencyResult.deadline,
    actionRequired: raw.actionRequired,
    actionUrl: raw.actionUrl,
    confidence: raw.confidence,

    eligibility: raw.eligibility,
    isEligible: eligibilityResult.eligible,
    eligibilityReasons: eligibilityResult.reasons,

    importanceScore: importanceResult.score,
    urgencyScore: urgencyResult.score,
    priorityScore: priorityResult.score,
    priorityLevel: priorityResult.level,
    priorityReasons: priorityResult.reasons,
  };
}

module.exports = { runPipeline, ItemIgnoredError };
