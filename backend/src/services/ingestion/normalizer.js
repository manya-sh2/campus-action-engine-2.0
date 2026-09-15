// Turns the normalized Gmail/Classroom service outputs (see
// services/google/gmail.service.js and classroom.service.js) into a
// single common shape the rest of the intelligence pipeline (LLM
// extraction, decision engines) can work with, without caring which
// Google API an item came from.
//
// Common shape ("NormalizedItem"):
// {
//   source: 'gmail' | 'classroom',
//   sourceId: string,
//   sourceType: 'email' | 'announcement' | 'courseWork',
//   title: string,
//   text: string,          // the unstructured text handed to the LLM
//   from: string|undefined,     // sender or course name
//   courseId: string|undefined,
//   link: string|undefined,
//   occurredAt: string|undefined, // ISO date, informational only
//   workType: string|undefined,   // Classroom courseWork workType (ASSIGNMENT/MATERIAL/etc.)
// }

function normalizeGmailMessage(message) {
  return {
    source: 'gmail',
    sourceId: message.id,
    sourceType: 'email',
    title: message.subject || '(no subject)',
    text: (message.body && message.body.text) || message.snippet || '',
    from: message.from,
    link: message.id ? `https://mail.google.com/mail/u/0/#inbox/${message.id}` : undefined,
    occurredAt: message.receivedAt,
  };
}

function normalizeClassroomAnnouncement(announcement, courseName) {
  return {
    source: 'classroom',
    sourceId: announcement.id,
    sourceType: 'announcement',
    title: courseName ? `${courseName}: Announcement` : 'Classroom Announcement',
    text: announcement.text || '',
    from: courseName,
    courseId: announcement.courseId,
    link: announcement.alternateLink,
    occurredAt: announcement.updateTime || announcement.creationTime,
  };
}

function normalizeClassroomCourseWork(courseWork, courseName) {
  const dueDateText = courseWork.dueDate
    ? `${courseWork.dueDate.year}-${String(courseWork.dueDate.month).padStart(2, '0')}-${String(
      courseWork.dueDate.day
    ).padStart(2, '0')}`
    : '';

  const text = [
    courseWork.description || '',
    dueDateText ? `Due date: ${dueDateText}` : '',
    typeof courseWork.maxPoints === 'number' ? `Max points: ${courseWork.maxPoints}` : '',
    // Include workType in the text so the LLM / mock extractor can distinguish
    // ASSIGNMENT from MATERIAL and classify accordingly.
    courseWork.workType ? `Work type: ${courseWork.workType}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    source: 'classroom',
    sourceId: courseWork.id,
    sourceType: 'courseWork',
    title: courseWork.title || (courseName ? `${courseName}: Coursework` : 'Classroom Coursework'),
    text,
    from: courseName,
    courseId: courseWork.courseId,
    link: courseWork.alternateLink,
    occurredAt: courseWork.updateTime || courseWork.creationTime,
    workType: courseWork.workType,  // preserved so downstream services can inspect it directly
  };
}

module.exports = { normalizeGmailMessage, normalizeClassroomAnnouncement, normalizeClassroomCourseWork };
