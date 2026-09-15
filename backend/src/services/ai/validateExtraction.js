const { CATEGORIES, CLASSIFICATIONS } = require('./extractionSchema');

function isValidDeadline(value) {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/**
 * Validates the shape of raw LLM/mock extraction output. Returns an
 * array of human-readable error strings; empty array means it's valid.
 *
 * This is deliberately independent of OpenAI's own "strict" JSON Schema
 * enforcement - it's the defense-in-depth layer that protects the rest
 * of the pipeline (and the database) from malformed output regardless
 * of whether it came from a real LLM response, a provider bug, or the
 * mock extractor.
 */
function validateExtraction(raw) {
  if (!raw || typeof raw !== 'object') {
    return ['Extraction output is missing or not an object'];
  }

  const errors = [];

  // --- New classification fields ---
  if (!CLASSIFICATIONS.includes(raw.classification)) {
    errors.push(`classification must be one of: ${CLASSIFICATIONS.join(', ')}`);
  }
  // ignoreReason: required string when IGNORE, must be null otherwise
  if (raw.classification === 'IGNORE') {
    if (raw.ignoreReason !== null && typeof raw.ignoreReason !== 'string') {
      errors.push('ignoreReason must be a non-null string when classification is IGNORE');
    }
  } else {
    if (raw.ignoreReason !== null && raw.ignoreReason !== undefined) {
      // Soft coerce: if the LLM accidentally put a string here for non-IGNORE items
      // we allow it rather than reject the whole item - the pipeline will override it.
      // Only hard-fail if it's a completely wrong type.
      if (typeof raw.ignoreReason !== 'string' && raw.ignoreReason !== null) {
        errors.push('ignoreReason must be null when classification is not IGNORE');
      }
    }
  }

  // --- Existing fields ---
  if (!CATEGORIES.includes(raw.category)) {
    errors.push(`category must be one of: ${CATEGORIES.join(', ')}`);
  }
  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    errors.push('title must be a non-empty string');
  }
  if (raw.organization !== null && typeof raw.organization !== 'string') {
    errors.push('organization must be a string or null');
  }
  if (typeof raw.description !== 'string') {
    errors.push('description must be a string');
  }

  if (!raw.eligibility || typeof raw.eligibility !== 'object') {
    errors.push('eligibility must be an object');
  } else {
    if (!Array.isArray(raw.eligibility.branches) || !raw.eligibility.branches.every((b) => typeof b === 'string')) {
      errors.push('eligibility.branches must be an array of strings');
    }
    if (raw.eligibility.minCgpa !== null && typeof raw.eligibility.minCgpa !== 'number') {
      errors.push('eligibility.minCgpa must be a number or null');
    }
    if (
      !Array.isArray(raw.eligibility.graduationYears) ||
      !raw.eligibility.graduationYears.every((y) => typeof y === 'number')
    ) {
      errors.push('eligibility.graduationYears must be an array of numbers');
    }
  }

  if (!Array.isArray(raw.skills) || !raw.skills.every((s) => typeof s === 'string')) {
    errors.push('skills must be an array of strings');
  }

  if (!isValidDeadline(raw.deadline)) {
    errors.push('deadline must be a valid date string or null');
  }

  if (raw.actionRequired !== null && typeof raw.actionRequired !== 'string') {
    errors.push('actionRequired must be a string or null');
  }
  if (raw.actionUrl !== null && typeof raw.actionUrl !== 'string') {
    errors.push('actionUrl must be a string or null');
  }

  if (typeof raw.confidence !== 'number' || raw.confidence < 0 || raw.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }

  return errors;
}

module.exports = validateExtraction;
