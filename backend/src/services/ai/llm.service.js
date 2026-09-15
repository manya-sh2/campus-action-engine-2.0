const OpenAI = require('openai');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { EXTRACTION_JSON_SCHEMA } = require('./extractionSchema');
const { extractMock } = require('./mock.extraction');

// This module is the ONLY place that talks to the OpenAI API. It
// extracts structured FACTS from unstructured Gmail/Classroom text and
// also classifies whether the item is actionable/important or should be
// ignored entirely. It never decides eligibility, importance scores,
// urgency, or priority - those are deterministic backend decisions made
// in services/decision/*.

let client = null;
function getClient() {
  if (!client) {
    if (!env.OPENAI_API_KEY) {
      throw ApiError.badRequest(
        'OPENAI_API_KEY is not configured. Set it in .env, or set OPENAI_MOCK_MODE=true for local testing without a key.'
      );
    }
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `You are an actionable-campus-alert extraction assistant for a college student's action-tracking app.

Your job is to analyze the title and body of an email or Google Classroom announcement/assignment, then:
1. CLASSIFY it into exactly one of: ACTION_REQUIRED, IMPORTANT_INFORMATION, or IGNORE
2. Extract only the structured facts that matter if the item is not ignored

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLASSIFICATION RULES (apply in this order)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Set classification = "IGNORE" for:
- Promotional, marketing, or newsletter emails (unsubscribe links, deals, offers)
- FYI / informational messages that require no action and have no academic consequence
- Classroom material/resource/notes/lecture uploads (no deadline, no submission)
- General classroom announcements that are purely informational ("class tomorrow as usual")
- Irrelevant content (social media, spam, unrelated topics)
- Opportunities (internship/job/scholarship) that are clearly for students outside the
  student's field or are just awareness notices with no apply link/form

Set classification = "IMPORTANT_INFORMATION" for:
- Exam schedules, date sheets, timetables, seating plans / seating arrangements
- Exam hall ticket / admit card availability
- Registration deadlines (fee payment, course enrollment, exam form)
- Result declarations or recheck/re-evaluation notices
- Any academic announcement a student MUST know about even if no direct action is needed

Set classification = "ACTION_REQUIRED" for:
- Internship / job / scholarship opportunities the student can apply for, with a link or form
- Assignments and coursework with a future due date that must be submitted
- Workshop, competition, or event registrations that are open
- Semester registration / re-registration tasks
- Any clearly time-sensitive item that requires the student to DO something

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXTRACTION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Only extract facts explicitly stated or clearly implied by the text.
- Do NOT invent eligibility criteria, deadlines, skills, or organizations.
- If a field is not mentioned, use null (for nullable fields) or [] (for arrays).

description field:
  Write a concise 1-2 sentence actionable summary of what the student needs to know/do.
  DO NOT copy the full email or announcement body. Keep it under 200 characters.
  For IGNORE items, use an empty string "".

ignoreReason field:
  Required when classification = "IGNORE". Use one of these snake_case values:
    promotional_email | material_upload | fyi_announcement | newsletter |
    ineligible_opportunity | irrelevant_content | past_deadline
  Must be null when classification != "IGNORE".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Input: "Amazon SDE Internship - CSE/IT, CGPA 8+, graduating 2027, Apply by Sept 30"
→ classification: "ACTION_REQUIRED", category: "internship"
→ description: "Amazon SDE internship open to CSE/IT students (CGPA 8+, 2027 batch). Apply by September 30."

Input: "Lecture notes for Unit 3 have been uploaded to the classroom stream"
→ classification: "IGNORE", ignoreReason: "material_upload"

Input: "Mid-semester exam date sheet released. Exams from Oct 5 to Oct 12."
→ classification: "IMPORTANT_INFORMATION", category: "exam"
→ description: "Mid-semester exams scheduled October 5–12. Check the date sheet for subject-wise schedule."

Input: "Flash sale! 50% off on online courses this weekend only."
→ classification: "IGNORE", ignoreReason: "promotional_email"

Input: "Assignment 3 due by midnight tonight - submit on Classroom"
→ classification: "ACTION_REQUIRED", category: "assignment"

You do NOT decide whether the student is eligible, how important this is (score-wise),
or how urgent it is — the backend scoring engines handle that from your extracted facts.`;

function buildUserContent(normalizedItem) {
  return [
    `Title: ${normalizedItem.title || '(no title)'}`,
    `Source: ${normalizedItem.source} (${normalizedItem.sourceType})`,
    normalizedItem.from ? `From/Course: ${normalizedItem.from}` : null,
    normalizedItem.occurredAt ? `Received: ${normalizedItem.occurredAt}` : null,
    '',
    normalizedItem.text || '(no body text)',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/**
 * Extracts structured information and classification from a single NormalizedItem.
 * Returns the raw parsed object (still subject to validateExtraction()
 * before it's trusted). Throws an ApiError describing why this item
 * couldn't be extracted - callers are expected to catch this per-item.
 */
async function extractStructuredInfo(normalizedItem) {
  if (env.OPENAI_MOCK_MODE) {
    return extractMock(normalizedItem);
  }

  const openai = getClient();

  let response;
  try {
    response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(normalizedItem) },
      ],
      response_format: { type: 'json_schema', json_schema: EXTRACTION_JSON_SCHEMA },
    });
  } catch (err) {
    throw ApiError.badGateway(`OpenAI extraction request failed: ${err.message}`);
  }

  const choice = response.choices && response.choices[0];
  const message = choice && choice.message;

  if (!message) {
    throw ApiError.badGateway('OpenAI returned an empty response');
  }

  // 2026-era structured outputs can return a first-class refusal instead
  // of JSON (e.g. the model declines to process the content) - treat
  // that as a per-item failure, not a crash.
  if (message.refusal) {
    throw ApiError.badGateway(`OpenAI declined to process this item: ${message.refusal}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(message.content);
  } catch (err) {
    throw ApiError.badGateway('OpenAI returned malformed JSON that could not be parsed');
  }

  return parsed;
}

module.exports = { extractStructuredInfo };
