const mongoose = require('mongoose');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Represents a student's profile. This is the core entity that future
// phases (eligibility matching, importance/priority scoring) will read
// from heavily, so keep it clean and well-indexed even though it's
// minimal for now.
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Invalid email address'],
    },
    // Populated once Google OAuth is implemented in a later phase.
    // Sparse + unique so multiple users without a googleId (dev-created
    // users) don't collide on `null`.
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    branch: {
      type: String,
      trim: true,
    },
    year: {
      type: Number,
      min: [1, 'Year must be a positive number'],
    },
    graduationYear: {
      type: Number,
      min: [2000, 'Graduation year seems invalid'],
      max: [2100, 'Graduation year seems invalid'],
    },
    cgpa: {
      type: Number,
      min: [0, 'CGPA cannot be negative'],
      max: [10, 'CGPA cannot exceed 10'],
    },
    skills: {
      type: [String],
      default: [],
    },
    preferredRoles: {
      type: [String],
      default: [],
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
    },
  },
  { timestamps: true }
);

// email already gets a unique index from `unique: true` above.
// Index branch + graduationYear since future eligibility matching will
// frequently filter/query students by these fields together.
userSchema.index({ branch: 1, graduationYear: 1 });

module.exports = mongoose.model('User', userSchema);
