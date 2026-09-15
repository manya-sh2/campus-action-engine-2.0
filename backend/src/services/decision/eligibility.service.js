// Deterministic eligibility check against the student's own profile.
// The LLM only extracted the *criteria* (raw.eligibility) - whether a
// given student actually meets them is a backend decision, made here.
//
// Design note: only hard requirements (branch, CGPA, graduation year)
// are treated as eligibility criteria. Preferred/relevant skills
// (raw.skills) are NOT eligibility gates - they feed the importance
// engine instead. This mirrors the worked example from the product
// spec: "CSE/IT, CGPA 8+, graduating 2027" are eligibility criteria;
// "Node.js or Java preferred" is a skill-match signal, not a gate.

function normalize(str) {
  return String(str).toLowerCase().trim();
}

/**
 * @param {object} user - the student's profile (User document)
 * @param {object} extraction - validated LLM/mock extraction output
 * @returns {{ eligible: boolean, reasons: string[], hasCriteria: boolean }}
 */
function evaluateEligibility(user, extraction) {
  const criteria = (extraction && extraction.eligibility) || {};
  const reasons = [];
  let eligible = true;
  let hasCriteria = false;

  // --- Branch ---
  if (Array.isArray(criteria.branches) && criteria.branches.length > 0) {
    hasCriteria = true;
    if (!user.branch) {
      reasons.push('Branch requirement present but your profile has no branch set - could not verify');
    } else {
      const allowed = criteria.branches.map(normalize);
      if (allowed.includes(normalize(user.branch))) {
        reasons.push(`Eligible based on branch (${user.branch})`);
      } else {
        eligible = false;
        reasons.push(`Branch mismatch: requires one of [${criteria.branches.join(', ')}], your branch is ${user.branch}`);
      }
    }
  }

  // --- CGPA ---
  if (typeof criteria.minCgpa === 'number') {
    hasCriteria = true;
    if (typeof user.cgpa !== 'number') {
      reasons.push(`Minimum CGPA of ${criteria.minCgpa} required but your profile has no CGPA set - could not verify`);
    } else if (user.cgpa >= criteria.minCgpa) {
      reasons.push(`CGPA requirement satisfied (${user.cgpa} >= ${criteria.minCgpa})`);
    } else {
      eligible = false;
      reasons.push(`CGPA requirement not met (${user.cgpa} < ${criteria.minCgpa})`);
    }
  }

  // --- Graduation year ---
  if (Array.isArray(criteria.graduationYears) && criteria.graduationYears.length > 0) {
    hasCriteria = true;
    if (!user.graduationYear) {
      reasons.push('Graduation year requirement present but your profile has no graduation year set - could not verify');
    } else if (criteria.graduationYears.includes(user.graduationYear)) {
      reasons.push(`Graduation year matches (${user.graduationYear})`);
    } else {
      eligible = false;
      reasons.push(
        `Graduation year mismatch: requires one of [${criteria.graduationYears.join(', ')}], yours is ${user.graduationYear}`
      );
    }
  }

  if (!hasCriteria) {
    reasons.push('No explicit eligibility requirements were detected - treated as open to all students');
  }

  return { eligible, reasons, hasCriteria };
}

module.exports = { evaluateEligibility };
