// Deterministic, explainable 0-100 "how relevant is this to THIS
// student" score. The LLM never assigns this - it only supplied facts
// (category, skills, etc.); the weighting and math live here.
//
// Weight breakdown (sums to 100):
//   eligibility match   -> up to 35
//   category relevance  -> up to 25
//   preferred role match -> up to 20
//   skill match          -> up to 20

const CATEGORY_BASE_SCORE = {
  job: 25,
  internship: 25,
  scholarship: 22,
  exam: 20,
  assignment: 20,
  registration: 15,
  event: 10,
  announcement: 8,
  other: 5,
};

/**
 * @param {object} params
 * @param {object} params.user
 * @param {object} params.extraction - validated LLM/mock extraction output
 * @param {{ eligible: boolean, hasCriteria: boolean }} params.eligibilityResult
 * @returns {{ score: number, reasons: string[] }}
 */
function scoreImportance({ user, extraction, eligibilityResult }) {
  const reasons = [];
  let score = 0;

  // --- Eligibility component (max 35) ---
  if (eligibilityResult.hasCriteria) {
    if (eligibilityResult.eligible) {
      score += 35;
      reasons.push('Eligibility requirements are met (+35)');
    } else {
      reasons.push('Eligibility requirements are not met (+0)');
    }
  } else {
    score += 25;
    reasons.push('No explicit eligibility requirements - open to all students (+25)');
  }

  // --- Category relevance (max 25) ---
  const category = (extraction.category || 'other').toLowerCase();
  const categoryScore = CATEGORY_BASE_SCORE[category] !== undefined ? CATEGORY_BASE_SCORE[category] : CATEGORY_BASE_SCORE.other;
  score += categoryScore;
  reasons.push(`Category '${category}' relevance (+${categoryScore})`);

  // --- Preferred role match (max 20) ---
  const preferredRoles = (user.preferredRoles || []).map((r) => String(r).toLowerCase()).filter(Boolean);
  if (preferredRoles.length > 0) {
    const haystack = `${extraction.title || ''} ${extraction.organization || ''} ${extraction.description || ''}`.toLowerCase();
    const matchedRole = preferredRoles.find((role) => haystack.includes(role));
    if (matchedRole) {
      score += 20;
      reasons.push(`Matches your preferred role "${matchedRole}" (+20)`);
    } else {
      reasons.push('Does not clearly match your preferred roles (+0)');
    }
  }

  // --- Skill match (max 20, proportional to overlap) ---
  const extractionSkills = (extraction.skills || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const userSkills = (user.skills || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  if (extractionSkills.length > 0 && userSkills.length > 0) {
    const matched = extractionSkills.filter((s) => userSkills.includes(s));
    const ratio = matched.length / extractionSkills.length;
    const skillScore = Math.round(ratio * 20);
    score += skillScore;
    if (matched.length > 0) {
      reasons.push(`Skill match: ${matched.join(', ')} (+${skillScore})`);
    } else {
      reasons.push('No matching skills found (+0)');
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, reasons };
}

module.exports = { scoreImportance };
