const { google } = require('googleapis');
const env = require('../../config/env');
const oauthService = require('./oauth.service');
const translateGoogleError = require('../../utils/translateGoogleError');
const ApiError = require('../../utils/ApiError');
const mockData = require('./mock.data');
const { isWithinSyncWindow } = require('../../utils/syncWindow');
// Cap each type per course to bound API usage for free-tier projects.
const MAX_ITEMS_PER_COURSE = 200;

async function listRecent(getPage, collectionKey) {
  const result = [];
  let pageToken;
  do {
    const { data } = await getPage({ pageSize: 100, ...(pageToken ? { pageToken } : {}) });
    const items = data[collectionKey] || [];
    result.push(...items.filter((item) => isWithinSyncWindow(item.creationTime)));
    pageToken = data.nextPageToken;
  } while (pageToken && result.length < MAX_ITEMS_PER_COURSE);
  return result.slice(0, MAX_ITEMS_PER_COURSE);
}


function classroomClient(authClient) {
  return google.classroom({ version: 'v1', auth: authClient });
}

async function getCourses(userId) {
  if (env.GOOGLE_MOCK_MODE) {
    return mockData.classroomCourses;
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const classroom = classroomClient(client);

  try {
    const { data } = await classroom.courses.list({ courseStates: ['ACTIVE'], pageSize: 50 });
    return (data.courses || []).map((c) => ({
      id: c.id,
      name: c.name,
      section: c.section,
      descriptionHeading: c.descriptionHeading,
      room: c.room,
      courseState: c.courseState,
      alternateLink: c.alternateLink,
    }));
  } catch (err) {
    throw translateGoogleError(err, 'Google Classroom');
  }
}

async function getAnnouncements(userId, courseId) {
  if (!courseId) {
    throw ApiError.badRequest('courseId query parameter is required');
  }

  if (env.GOOGLE_MOCK_MODE) {
    return mockData.classroomAnnouncements.filter((announcement) => isWithinSyncWindow(announcement.creationTime));
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const classroom = classroomClient(client);

  try {
    const announcements = await listRecent(
      (params) => classroom.courses.announcements.list({ courseId, ...params }),
      'announcements'
    );
    return announcements.map((a) => ({
        id: a.id,
        courseId: a.courseId,
        text: a.text,
        state: a.state,
        creationTime: a.creationTime,
        updateTime: a.updateTime,
        alternateLink: a.alternateLink,
        materials: a.materials || [],
      }));
  } catch (err) {
    throw translateGoogleError(err, 'Google Classroom');
  }
}

async function getCourseWork(userId, courseId) {
  if (!courseId) {
    throw ApiError.badRequest('courseId query parameter is required');
  }

  if (env.GOOGLE_MOCK_MODE) {
    return mockData.classroomCourseWork.filter((work) => isWithinSyncWindow(work.creationTime));
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const classroom = classroomClient(client);

  try {
    const coursework = await listRecent(
      (params) => classroom.courses.courseWork.list({ courseId, ...params }),
      'courseWork'
    );
    return coursework.map((w) => ({
        id: w.id,
        courseId: w.courseId,
        title: w.title,
        description: w.description,
        state: w.state,
        alternateLink: w.alternateLink,
        creationTime: w.creationTime,
        updateTime: w.updateTime,
        dueDate: w.dueDate,
        dueTime: w.dueTime,
        maxPoints: w.maxPoints,
        workType: w.workType,
      }));
  } catch (err) {
    throw translateGoogleError(err, 'Google Classroom');
  }
}

async function getCourseWorkDetails(userId, courseId, courseWorkId) {
  if (env.GOOGLE_MOCK_MODE) {
    const found = mockData.classroomCourseWork.find((w) => w.id === courseWorkId);
    if (!found) throw ApiError.notFound(`Mock courseWork '${courseWorkId}' not found`);
    return found;
  }

  if (!courseId || !courseWorkId) {
    throw ApiError.badRequest('courseId and courseWorkId are required');
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const classroom = classroomClient(client);

  try {
    const { data } = await classroom.courses.courseWork.get({ courseId, id: courseWorkId });
    return data;
  } catch (err) {
    throw translateGoogleError(err, 'Google Classroom');
  }
}

module.exports = { getCourses, getAnnouncements, getCourseWork, getCourseWorkDetails };
