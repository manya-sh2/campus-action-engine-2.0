// Clearly-separated canned data used ONLY when GOOGLE_MOCK_MODE=true.
// Lets the rest of the app (routes, auth, controllers, and later the
// ingestion/decision pipeline) be exercised without real Google Cloud
// credentials. The real Gmail/Classroom/Drive integrations in the
// sibling *.service.js files are NOT replaced by this - each service
// only reaches for this data when the mock flag is explicitly on.
//
// Test case coverage (for OPENAI_MOCK_MODE=true, user branch=CSE, cgpa=8.5):
//
// Gmail:
//   mock-msg-1  → ACTION_REQUIRED   (internship, CSE eligible)       SHOW
//   mock-msg-2  → ACTION_REQUIRED   (registration deadline)           SHOW
//   mock-msg-3  → IGNORE            (internship, MECH only — ineligible)  IGNORE
//   mock-msg-4  → IMPORTANT_INFORMATION (exam date sheet)             SHOW
//   mock-msg-5  → IGNORE            (promotional/newsletter)          IGNORE
//   mock-msg-6  → IGNORE            (irrelevant email)                IGNORE
//
// Classroom Announcements:
//   mock-announcement-1 → IMPORTANT_INFORMATION (midterm exam mention) SHOW
//   mock-announcement-2 → IMPORTANT_INFORMATION (exam date sheet)      SHOW
//   mock-announcement-3 → IMPORTANT_INFORMATION (seating plan)         SHOW
//   mock-announcement-4 → IGNORE (material upload)                     IGNORE
//   mock-announcement-5 → IGNORE (normal / FYI announcement)           IGNORE
//
// Classroom CourseWork:
//   mock-coursework-1 → ACTION_REQUIRED (assignment, future deadline)  SHOW
//   mock-coursework-2 → IGNORE          (assignment, past deadline)     IGNORE

const NOW = new Date();

// Helper: date offset from now
function daysFromNow(n) {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}
function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const gmailMessages = [
  // ── SHOW: Internship — eligible for CSE branch ────────────────────────────
  {
    id: 'mock-msg-1',
    threadId: 'mock-thread-1',
    from: 'careers@amazon.example.com',
    to: 'student@example.com',
    subject: 'Amazon SDE Internship - Applications Open',
    snippet: 'Amazon is hiring SDE interns. CSE/IT students with CGPA 8+...',
    body: {
      text:
        'Amazon is hiring SDE interns for Summer 2027. CSE/IT students with CGPA 8+ graduating in 2027 are eligible. ' +
        'Node.js or Java experience preferred. Apply before September 30 using the link below. ' +
        'https://amazon.jobs/apply-intern-2027',
      html: '',
    },
    attachments: [],
    receivedAt: NOW.toISOString(),
    labelIds: ['INBOX'],
  },

  // ── SHOW: Registration deadline ───────────────────────────────────────────
  {
    id: 'mock-msg-2',
    threadId: 'mock-thread-2',
    from: 'noreply@college.example.edu',
    to: 'student@example.com',
    subject: 'Semester Registration Deadline — Last Date September 20',
    snippet: 'This is a reminder that semester registration closes soon.',
    body: {
      text:
        'This is a reminder that semester registration closes on September 20th. ' +
        'Please log in to the student portal and complete your course registration before the deadline. ' +
        'https://portal.college.example.edu/register',
      html: '',
    },
    attachments: [],
    receivedAt: NOW.toISOString(),
    labelIds: ['INBOX'],
  },

  // ── IGNORE: Internship — MECH only (student is CSE → ineligible) ─────────
  {
    id: 'mock-msg-3',
    threadId: 'mock-thread-3',
    from: 'hr@autocompany.example.com',
    to: 'student@example.com',
    subject: 'Mechanical Engineering Internship — MECH/CIVIL Students Only',
    snippet: 'Internship for mechanical engineering students only.',
    body: {
      text:
        'We are hiring interns for our manufacturing division. ' +
        'Only MECH or CIVIL students graduating in 2027 are eligible. CGPA 7+. ' +
        'Apply at https://autocompany.example.com/intern',
      html: '',
    },
    attachments: [],
    receivedAt: NOW.toISOString(),
    labelIds: ['INBOX'],
  },

  // ── SHOW: Exam date sheet from email ─────────────────────────────────────
  {
    id: 'mock-msg-4',
    threadId: 'mock-thread-4',
    from: 'examcell@college.example.edu',
    to: 'student@example.com',
    subject: 'End Semester Examination Date Sheet — November 2026',
    snippet: 'The date sheet for end semester exams has been released.',
    body: {
      text:
        'The date sheet for End Semester Examinations (November 2026) has been released. ' +
        'Examinations will be held from November 10 to November 25, 2026. ' +
        'Please check the notice board or the college website for subject-wise schedule. ' +
        'Hall tickets will be available from November 1, 2026.',
      html: '',
    },
    attachments: [],
    receivedAt: NOW.toISOString(),
    labelIds: ['INBOX'],
  },

  // ── IGNORE: Promotional / newsletter ─────────────────────────────────────
  {
    id: 'mock-msg-5',
    threadId: 'mock-thread-5',
    from: 'noreply@coursera.example.com',
    to: 'student@example.com',
    subject: 'Limited Time Offer: 50% off on all courses this weekend!',
    snippet: 'Get 50% off on all Coursera courses this weekend only.',
    body: {
      text:
        'This weekend only — get 50% off on ALL Coursera courses! ' +
        'Upgrade your skills with our top-rated programs. Sale ends Sunday. ' +
        'Click here to buy now. To unsubscribe from promotional emails, click here.',
      html: '',
    },
    attachments: [],
    receivedAt: NOW.toISOString(),
    labelIds: ['INBOX'],
  },

  // ── IGNORE: Irrelevant / FYI email ────────────────────────────────────────
  {
    id: 'mock-msg-6',
    threadId: 'mock-thread-6',
    from: 'library@college.example.edu',
    to: 'student@example.com',
    subject: 'Library Newsletter — October Reading List',
    snippet: 'Check out the recommended reading list for October.',
    body: {
      text:
        'Dear student, the library team has put together a recommended reading list for October. ' +
        'Visit the library to explore new arrivals in fiction, science, and history. ' +
        'The library is open Monday to Saturday, 9 AM to 6 PM.',
      html: '',
    },
    attachments: [],
    receivedAt: NOW.toISOString(),
    labelIds: ['INBOX'],
  },
];

const classroomCourses = [
  {
    id: 'mock-course-1',
    name: 'Data Structures and Algorithms',
    section: 'CSE-3A',
    descriptionHeading: 'DSA',
    room: '204',
    courseState: 'ACTIVE',
    alternateLink: 'https://classroom.google.com/mock-course-1',
  },
];

const classroomAnnouncements = [
  // ── SHOW: Midterm exam mentioned ──────────────────────────────────────────
  {
    id: 'mock-announcement-1',
    courseId: 'mock-course-1',
    text: 'Midterm exam is scheduled for next Friday (September 20). The exam will cover Units 1–3. Be prepared.',
    state: 'PUBLISHED',
    creationTime: NOW.toISOString(),
    updateTime: NOW.toISOString(),
    alternateLink: 'https://classroom.google.com/mock-announcement-1',
    materials: [],
  },

  // ── SHOW: Exam date sheet announcement ───────────────────────────────────
  {
    id: 'mock-announcement-2',
    courseId: 'mock-course-1',
    text:
      'The End Semester Examination date sheet has been released. DSA exam is on November 12, 2026 at 10 AM. ' +
      'Please check the official notice board for the complete schedule.',
    state: 'PUBLISHED',
    creationTime: NOW.toISOString(),
    updateTime: NOW.toISOString(),
    alternateLink: 'https://classroom.google.com/mock-announcement-2',
    materials: [],
  },

  // ── SHOW: Seating plan / seating arrangement ──────────────────────────────
  {
    id: 'mock-announcement-3',
    courseId: 'mock-course-1',
    text:
      'The seating plan for the midterm exam has been posted. Please check the notice board at Block B. ' +
      'Students must be seated 15 minutes before the exam.',
    state: 'PUBLISHED',
    creationTime: NOW.toISOString(),
    updateTime: NOW.toISOString(),
    alternateLink: 'https://classroom.google.com/mock-announcement-3',
    materials: [],
  },

  // ── IGNORE: Material upload ───────────────────────────────────────────────
  {
    id: 'mock-announcement-4',
    courseId: 'mock-course-1',
    text: 'Lecture notes for Unit 4 (Graphs and Trees) have been uploaded to the classroom stream. Please download and review.',
    state: 'PUBLISHED',
    creationTime: NOW.toISOString(),
    updateTime: NOW.toISOString(),
    alternateLink: 'https://classroom.google.com/mock-announcement-4',
    materials: [
      { driveFile: { driveFile: { id: 'mock-file-unit4', title: 'Unit4_Graphs.pdf' } } },
    ],
  },

  // ── IGNORE: Normal / FYI classroom announcement ───────────────────────────
  {
    id: 'mock-announcement-5',
    courseId: 'mock-course-1',
    text: 'Tomorrow\'s class (Wednesday) will be held in Room 301 instead of the usual Room 204.',
    state: 'PUBLISHED',
    creationTime: NOW.toISOString(),
    updateTime: NOW.toISOString(),
    alternateLink: 'https://classroom.google.com/mock-announcement-5',
    materials: [],
  },
];

const classroomCourseWork = [
  // ── SHOW: Assignment with a future deadline ───────────────────────────────
  {
    id: 'mock-coursework-1',
    courseId: 'mock-course-1',
    title: 'Assignment 3 — Graph Algorithms',
    description: 'Implement Dijkstra\'s shortest path and BFS on a weighted graph. Submit a single Python file.',
    state: 'PUBLISHED',
    alternateLink: 'https://classroom.google.com/mock-coursework-1',
    creationTime: NOW.toISOString(),
    updateTime: NOW.toISOString(),
    dueDate: { year: 2026, month: 9, day: 25 },  // Future date
    dueTime: { hours: 23, minutes: 59 },
    maxPoints: 100,
    workType: 'ASSIGNMENT',
  },

  // ── IGNORE: Assignment whose deadline has passed ──────────────────────────
  {
    id: 'mock-coursework-2',
    courseId: 'mock-course-1',
    title: 'Assignment 1 — Arrays and Sorting',
    description: 'Implement merge sort and quick sort. Deadline was January 15, 2026.',
    state: 'PUBLISHED',
    alternateLink: 'https://classroom.google.com/mock-coursework-2',
    creationTime: new Date('2026-01-01').toISOString(),
    updateTime: new Date('2026-01-01').toISOString(),
    dueDate: { year: 2026, month: 1, day: 15 },  // Past date (January 2026)
    dueTime: { hours: 23, minutes: 59 },
    maxPoints: 100,
    workType: 'ASSIGNMENT',
  },
];

const driveFiles = [
  {
    id: 'mock-file-1',
    name: 'Resume_2026.pdf',
    mimeType: 'application/pdf',
    size: '204800',
    modifiedTime: NOW.toISOString(),
    webViewLink: 'https://drive.google.com/mock-file-1',
    iconLink: 'https://drive.google.com/mock-icon.png',
  },
];

module.exports = {
  gmailMessages,
  classroomCourses,
  classroomAnnouncements,
  classroomCourseWork,
  driveFiles,
};
