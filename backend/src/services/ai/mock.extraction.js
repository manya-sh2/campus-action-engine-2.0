// Clearly-separated heuristic "extraction" used ONLY when
// OPENAI_MOCK_MODE=true. This is NOT an LLM - it's a small rule-based
// parser so the rest of the pipeline (validation, eligibility,
// importance, urgency, priority, storage) can be exercised offline
// without an OpenAI API key or network access. The real integration in
// llm.service.js is not replaced by this - it's only reached when the
// mock flag is explicitly enabled.

const KNOWN_BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL', 'AIML', 'AI', 'DS'];
const KNOWN_SKILLS = ['Node.js', 'Java', 'Python', 'C++', 'React', 'MongoDB', 'SQL', 'JavaScript', 'AWS', 'Docker'];

// Keywords that signal an item is IGNORE-worthy despite a recognisable category.
const IGNORE_KEYWORDS = [
  'unsubscribe', 'newsletter', 'promotional', 'deal', 'offer', 'sale',
  'click here to buy', 'marketing', 'advertisement',
];

// Keywords that mark a classroom post as a material upload (not actionable).
const MATERIAL_KEYWORDS = [
  'uploaded', 'notes uploaded', 'slides uploaded', 'material uploaded',
  'recording uploaded', 'video uploaded', 'lecture notes', 'study material',
  'resource shared', 'file shared', 'pdf uploaded',
];

// Keywords that make an announcement IMPORTANT even if it's not a task.
const IMPORTANT_ANNOUNCEMENT_KEYWORDS = [
  'exam', 'midterm', 'final exam', 'date sheet', 'seating plan', 'seating arrangement',
  'exam schedule', 'timetable', 'time table', 'registration deadline', 'fee deadline',
  'last date', 'hall ticket', 'admit card', 'result declared', 'recheck', 'backlog',
];

function detectCategory(text) {
  const t = text.toLowerCase();
  if (/intern(ship)?/.test(t)) return 'internship';
  if (/(hiring|job opening|full[- ]time role)/.test(t)) return 'job';
  if (/scholarship/.test(t)) return 'scholarship';
  if (/(exam|midterm|final test|date sheet|seating plan)/.test(t)) return 'exam';
  if (/(assignment|homework|coursework)/.test(t)) return 'assignment';
  if (/regist(er|ration)/.test(t)) return 'registration';
  if (/(event|workshop|seminar|fest)/.test(t)) return 'event';
  return 'announcement';
}

function detectBranches(text) {
  return KNOWN_BRANCHES.filter((b) => new RegExp(`\\b${b}\\b`, 'i').test(text));
}

function detectSkills(text) {
  const lower = text.toLowerCase();
  return KNOWN_SKILLS.filter((s) => lower.includes(s.toLowerCase()));
}

function detectCgpa(text) {
  const match = text.match(/cgpa\s*(?:of|:)?\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function detectGraduationYears(text) {
  const matches = [...text.matchAll(/graduat\w*\s+(?:in|by)?\s*(20\d{2})/gi)];
  return [...new Set(matches.map((m) => Number(m[1])))];
}

function detectDeadline(text) {
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const monthMatch = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i
  );
  if (monthMatch) {
    const year = new Date().getFullYear();
    const date = new Date(`${monthMatch[1]} ${monthMatch[2]}, ${year}`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return null;
}

function actionForCategory(category) {
  switch (category) {
    case 'internship':
    case 'job':
      return 'APPLY';
    case 'assignment':
      return 'SUBMIT';
    case 'registration':
      return 'REGISTER';
    case 'exam':
      return 'PREPARE';
    default:
      return 'REVIEW';
  }
}

/**
 * Determines the classification for a normalized item.
 * Returns { classification, ignoreReason }.
 *
 * Decision rules (applied in order):
 * 1. Promotional / newsletter → IGNORE
 * 2. Classroom material upload → IGNORE
 * 3. Classroom courseWork whose due date has already passed → IGNORE
 * 4. Classroom courseWork with a future due date → ACTION_REQUIRED
 * 5. Announcement with important academic keywords → IMPORTANT_INFORMATION
 * 6. Plain announcement without academic urgency signals → IGNORE
 * 7. Opportunity categories (internship/job/scholarship) with apply/register
 *    language → ACTION_REQUIRED
 * 8. Exam / registration → IMPORTANT_INFORMATION (date/schedule info)
 *    or ACTION_REQUIRED (if explicit apply/register action needed)
 * 9. Anything else that is clearly a task → ACTION_REQUIRED
 * 10. Default fallback → IGNORE
 */
function classifyItem(normalizedItem, category, deadline) {
  const text = `${normalizedItem.title || ''} ${normalizedItem.text || ''}`.toLowerCase();
  const sourceType = normalizedItem.sourceType; // 'email' | 'announcement' | 'courseWork'

  // 1. Promotional / newsletter signals
  if (IGNORE_KEYWORDS.some((kw) => text.includes(kw))) {
    return { classification: 'IGNORE', ignoreReason: 'promotional_email' };
  }

  // 2. Classroom material upload
  if (MATERIAL_KEYWORDS.some((kw) => text.includes(kw))) {
    return { classification: 'IGNORE', ignoreReason: 'material_upload' };
  }

  // 3. Classroom courseWork with a past deadline
  if (sourceType === 'courseWork') {
    if (deadline) {
      const due = new Date(deadline);
      if (!Number.isNaN(due.getTime()) && due.getTime() <= Date.now()) {
        return { classification: 'IGNORE', ignoreReason: 'past_deadline' };
      }
    }
    // 4. Future deadline or no deadline — actionable assignment
    return { classification: 'ACTION_REQUIRED', ignoreReason: null };
  }

  // 5. Announcements — check for important academic keywords
  if (sourceType === 'announcement') {
    const isImportant = IMPORTANT_ANNOUNCEMENT_KEYWORDS.some((kw) => text.includes(kw));
    if (isImportant) {
      return { classification: 'IMPORTANT_INFORMATION', ignoreReason: null };
    }
    // 6. Plain announcement — ignore
    return { classification: 'IGNORE', ignoreReason: 'fyi_announcement' };
  }

  // Email path
  // 7. Opportunities
  if (['internship', 'job', 'scholarship'].includes(category)) {
    // Must have actual apply/register language to be actionable
    const hasAction = /(apply|application|register|submit|click here|link below|form|portal)/i.test(text);
    if (hasAction) {
      return { classification: 'ACTION_REQUIRED', ignoreReason: null };
    }
    return { classification: 'IGNORE', ignoreReason: 'fyi_announcement' };
  }

  // 8. Exam / date sheet info from email → IMPORTANT
  if (category === 'exam') {
    return { classification: 'IMPORTANT_INFORMATION', ignoreReason: null };
  }

  // Registration deadline
  if (category === 'registration') {
    return { classification: 'ACTION_REQUIRED', ignoreReason: null };
  }

  // Assignment from email
  if (category === 'assignment') {
    return { classification: 'ACTION_REQUIRED', ignoreReason: null };
  }

  // Event from email — could be relevant
  if (category === 'event') {
    const hasAction = /(register|apply|form|portal|sign up)/i.test(text);
    if (hasAction) return { classification: 'ACTION_REQUIRED', ignoreReason: null };
    return { classification: 'IGNORE', ignoreReason: 'fyi_announcement' };
  }

  // Plain announcement / other emails — only keep if important keywords present
  const isImportantEmail = IMPORTANT_ANNOUNCEMENT_KEYWORDS.some((kw) => text.includes(kw));
  if (isImportantEmail) {
    return { classification: 'IMPORTANT_INFORMATION', ignoreReason: null };
  }

  // 10. Fallback
  return { classification: 'IGNORE', ignoreReason: 'irrelevant_content' };
}

function buildConciseSummary(normalizedItem, category, classification) {
  if (classification === 'IGNORE') return '';

  const text = normalizedItem.text || normalizedItem.title || '';
  // Trim to first ~200 chars of the body, capped at 2 sentences
  const trimmed = text.replace(/\s+/g, ' ').trim();
  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  const summary = sentences.slice(0, 2).join(' ');
  return summary.slice(0, 250);
}

function extractMock(normalizedItem) {
  const text = `${normalizedItem.title || ''} ${normalizedItem.text || ''}`;
  const category = detectCategory(text);
  const deadline = detectDeadline(text);

  const { classification, ignoreReason } = classifyItem(normalizedItem, category, deadline);
  const description = buildConciseSummary(normalizedItem, category, classification);

  return {
    classification,
    ignoreReason,
    category,
    title: normalizedItem.title || '(untitled)',
    organization: normalizedItem.from || null,
    description,
    eligibility: {
      branches: detectBranches(text),
      minCgpa: detectCgpa(text),
      graduationYears: detectGraduationYears(text),
    },
    skills: detectSkills(text),
    deadline,
    actionRequired: classification !== 'IGNORE' ? actionForCategory(category) : null,
    actionUrl: normalizedItem.link || null,
    confidence: 0.5, // heuristic, not a real model confidence
  };
}

module.exports = { extractMock };
