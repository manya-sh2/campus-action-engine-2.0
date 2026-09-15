// JSON Schema handed to OpenAI's Structured Outputs (response_format:
// { type: 'json_schema', ... }, strict mode). Strict mode requires
// EVERY property (including nullable ones) to be listed under
// `required`, and `additionalProperties: false` on every object level -
// nullable fields express optionality via a `["type", "null"]` union
// instead of omitting them from `required`.

const EXTRACTION_JSON_SCHEMA = {
  name: 'campus_action_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      // --- Classification (MUST be set first; gates the rest of the pipeline) ---
      // ACTION_REQUIRED  : student must do something (apply, submit, register, etc.)
      // IMPORTANT_INFORMATION : no direct action but too important to miss (exam
      //                         schedule, date sheet, seating plan, registration deadline)
      // IGNORE           : promotional, FYI, newsletter, material upload, general
      //                    announcement, irrelevant, or ineligible opportunity
      classification: {
        type: 'string',
        enum: ['ACTION_REQUIRED', 'IMPORTANT_INFORMATION', 'IGNORE'],
      },
      // Short machine-readable reason used only when classification = IGNORE.
      // Examples: "promotional_email", "material_upload", "fyi_announcement",
      //           "newsletter", "ineligible_opportunity", "irrelevant_content",
      //           "past_deadline"
      // Must be null when classification != IGNORE.
      ignoreReason: { type: ['string', 'null'] },

      category: {
        type: 'string',
        enum: ['job', 'internship', 'assignment', 'exam', 'event', 'scholarship', 'registration', 'announcement', 'other'],
      },
      title: { type: 'string' },
      organization: { type: ['string', 'null'] },
      // A concise 1-2 sentence actionable summary of what the student needs
      // to know or do. Do NOT copy the full email/announcement body here.
      // For IGNORE items this can be empty string.
      description: { type: 'string' },
      eligibility: {
        type: 'object',
        additionalProperties: false,
        properties: {
          branches: { type: 'array', items: { type: 'string' } },
          minCgpa: { type: ['number', 'null'] },
          graduationYears: { type: 'array', items: { type: 'integer' } },
        },
        required: ['branches', 'minCgpa', 'graduationYears'],
      },
      skills: { type: 'array', items: { type: 'string' } },
      deadline: { type: ['string', 'null'] },
      actionRequired: { type: ['string', 'null'] },
      actionUrl: { type: ['string', 'null'] },
      confidence: { type: 'number' },
    },
    required: [
      'classification',
      'ignoreReason',
      'category',
      'title',
      'organization',
      'description',
      'eligibility',
      'skills',
      'deadline',
      'actionRequired',
      'actionUrl',
      'confidence',
    ],
  },
};

const CATEGORIES = EXTRACTION_JSON_SCHEMA.schema.properties.category.enum;
const CLASSIFICATIONS = EXTRACTION_JSON_SCHEMA.schema.properties.classification.enum;

module.exports = { EXTRACTION_JSON_SCHEMA, CATEGORIES, CLASSIFICATIONS };
