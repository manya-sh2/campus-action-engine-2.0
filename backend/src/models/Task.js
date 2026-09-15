const mongoose = require('mongoose');

// Hard eligibility criteria as extracted by the LLM (branch/CGPA/grad
// year only - see eligibility.service.js for why preferred skills are
// NOT part of eligibility but instead feed the importance engine).
const eligibilitySchema = new mongoose.Schema(
  {
    branches: { type: [String], default: [] },
    minCgpa: { type: Number, default: null },
    graduationYears: { type: [Number], default: [] },
  },
  { _id: false }
);

// Represents a single processed, scored, actionable item derived from
// Gmail or Classroom for one student. This is the output of the
// Normalizer → LLM Extraction → Validation → Classification Gate →
// Eligibility Gate → Importance → Urgency → Priority pipeline.
// (see services/sync.service.js and services/decision/pipeline.service.js)
//
// INVARIANT: Every Task document in the database has already passed the
// classification gate (classification is ACTION_REQUIRED or
// IMPORTANT_INFORMATION) and, for opportunity categories, the eligibility
// gate. Items classified as IGNORE never reach Task.create().
const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // --- Provenance (also used for duplicate prevention) ---
    source: {
      type: String,
      enum: ['gmail', 'classroom'],
      required: true,
    },
    sourceId: {
      type: String,
      required: true,
    },
    sourceType: {
      type: String,
      enum: ['email', 'announcement', 'courseWork'],
      required: true,
    },
    sourceLink: { type: String, trim: true },
    courseId: { type: String, trim: true },

    // --- Classification (pipeline gate result, never IGNORE by invariant) ---
    classification: {
      type: String,
      enum: ['ACTION_REQUIRED', 'IMPORTANT_INFORMATION'],
      // Optional for backward compat with tasks created before this field
      // was added — older tasks may not have it.
      default: null,
    },

    // --- LLM-extracted facts (never decisions - see ai/llm.service.js) ---
    // description is always a concise 1-2 sentence actionable summary;
    // the full email/announcement body is never stored here.
    category: {
      type: String,
      enum: ['job', 'internship', 'assignment', 'exam', 'event', 'scholarship', 'registration', 'announcement', 'other'],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    organization: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: '' },
    skills: { type: [String], default: [] },
    deadline: { type: Date, default: null },
    actionRequired: { type: String, trim: true, default: null },
    actionUrl: { type: String, trim: true, default: null },
    // LLM's own confidence in the extraction (0-1) - informational only,
    // never used as a substitute for the deterministic scores below.
    confidence: { type: Number, min: 0, max: 1 },

    // --- Backend-computed decisions (deterministic, explainable) ---
    eligibility: { type: eligibilitySchema, default: () => ({}) },
    isEligible: { type: Boolean, required: true },
    eligibilityReasons: { type: [String], default: [] },

    importanceScore: { type: Number, required: true, min: 0, max: 100 },
    urgencyScore: { type: Number, required: true, min: 0, max: 100 },
    priorityScore: { type: Number, required: true, min: 0, max: 100 },
    priorityLevel: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      required: true,
    },
    priorityReasons: { type: [String], default: [] },

    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'dismissed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Prevents duplicate records for the same user/source/sourceId - the
// primary defense against re-processing the same email/announcement on
// every sync. See task.service.js#createTaskIfNotExists for the
// pre-check + this index as a race-condition backstop.
taskSchema.index({ userId: 1, source: 1, sourceId: 1 }, { unique: true });

// Common query patterns for "my tasks" filtering/sorting.
taskSchema.index({ userId: 1, priorityScore: -1 });
taskSchema.index({ userId: 1, priorityLevel: 1 });
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, deadline: 1 });
taskSchema.index({ userId: 1, classification: 1 });

module.exports = mongoose.model('Task', taskSchema);
