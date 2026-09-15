const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lightweight manual validation for user profile payloads.
 * Kept dependency-free on purpose for this phase. Returns an array of
 * human-readable error strings; empty array means the input is valid.
 *
 * @param {object} body - request body
 * @param {object} [options]
 * @param {boolean} [options.partial] - if true, only validates fields that
 *   are present (used for PATCH); if false, required fields must be present
 *   (used for POST/create).
 */
function validateUserInput(body, { partial = false } = {}) {
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  // --- name ---
  if (!partial || has('name')) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('name is required and must be a non-empty string');
    }
  }

  // --- email ---
  if (!partial || has('email')) {
    if (!body.email || typeof body.email !== 'string' || !EMAIL_REGEX.test(body.email)) {
      errors.push('email is required and must be a valid email address');
    }
  }

  // --- branch (optional, string) ---
  if (has('branch') && body.branch !== undefined && body.branch !== null) {
    if (typeof body.branch !== 'string') {
      errors.push('branch must be a string');
    }
  }

  // --- year ---
  if (has('year') && body.year !== undefined && body.year !== null) {
    if (typeof body.year !== 'number' || !Number.isFinite(body.year) || body.year <= 0) {
      errors.push('year must be a positive number');
    }
  }

  // --- graduationYear ---
  if (has('graduationYear') && body.graduationYear !== undefined && body.graduationYear !== null) {
    if (
      typeof body.graduationYear !== 'number' ||
      !Number.isFinite(body.graduationYear) ||
      body.graduationYear < 2000 ||
      body.graduationYear > 2100
    ) {
      errors.push('graduationYear must be a sensible year between 2000 and 2100');
    }
  }

  // --- cgpa ---
  if (has('cgpa') && body.cgpa !== undefined && body.cgpa !== null) {
    if (typeof body.cgpa !== 'number' || !Number.isFinite(body.cgpa) || body.cgpa < 0 || body.cgpa > 10) {
      errors.push('cgpa must be a number between 0 and 10');
    }
  }

  // --- skills ---
  if (has('skills') && body.skills !== undefined && body.skills !== null) {
    if (!Array.isArray(body.skills) || !body.skills.every((s) => typeof s === 'string')) {
      errors.push('skills must be an array of strings');
    }
  }

  // --- preferredRoles ---
  if (has('preferredRoles') && body.preferredRoles !== undefined && body.preferredRoles !== null) {
    if (!Array.isArray(body.preferredRoles) || !body.preferredRoles.every((s) => typeof s === 'string')) {
      errors.push('preferredRoles must be an array of strings');
    }
  }

  // --- timezone (optional, string) ---
  if (has('timezone') && body.timezone !== undefined && body.timezone !== null) {
    if (typeof body.timezone !== 'string') {
      errors.push('timezone must be a string');
    }
  }

  return errors;
}

module.exports = validateUserInput;
