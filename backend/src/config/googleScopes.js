// Centralized, least-privilege OAuth scope configuration.
// Every service requests only the scopes it actually needs - do not add
// broader scopes "just in case".
const SCOPES = {
  // Needed to identify who signed in (id, email, name).
  IDENTITY: ['openid', 'email', 'profile'],

  // Read-only - this app never sends or modifies email.
  GMAIL: ['https://www.googleapis.com/auth/gmail.readonly'],

  // Read-only access to courses, announcements, and the student's own
  // coursework (not other students' submissions).
  CLASSROOM: [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.announcements.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  ],

  // drive.file (NOT drive.readonly or drive): the app can only see and
  // manage files it creates itself or that the user explicitly opens
  // with it - never the user's entire Drive. This is intentionally the
  // narrowest practical scope. See README for the tradeoff this implies
  // for file search, and how to widen it if full-Drive search is needed.
  DRIVE: ['https://www.googleapis.com/auth/drive.file'],
};

const ALL_SCOPES = [...SCOPES.IDENTITY, ...SCOPES.GMAIL, ...SCOPES.CLASSROOM, ...SCOPES.DRIVE];

module.exports = { SCOPES, ALL_SCOPES };
