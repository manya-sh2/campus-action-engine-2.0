const { google } = require('googleapis');
const env = require('../../config/env');
const oauthService = require('./oauth.service');
const translateGoogleError = require('../../utils/translateGoogleError');
const ApiError = require('../../utils/ApiError');
const mockData = require('./mock.data');
const CLASSROOM_LOOKBACK_DAYS = 7;

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
    const cutoff = Date.now() - CLASSROOM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    return mockData.classroomAnnouncements.filter((announcement) => {
      if (!announcement.creationTime) return true;

      return new Date(announcement.creationTime).getTime() >= cutoff;
    });
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const classroom = classroomClient(client);

  try {
    const { data } = await classroom.courses.announcements.list({
      courseId,
      pageSize: 20,
    });

    const cutoff = Date.now() - CLASSROOM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    return (data.announcements || [])
      .filter((a) => {
        if (!a.creationTime) return true;

        return new Date(a.creationTime).getTime() >= cutoff;
      })
      .map((a) => ({
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
    const cutoff = Date.now() - CLASSROOM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    return mockData.classroomCourseWork.filter((work) => {
      if (!work.creationTime) return true;

      return new Date(work.creationTime).getTime() >= cutoff;
    });
  }

  const client = await oauthService.getAuthorizedClient(userId);
  const classroom = classroomClient(client);

  try {
    const { data } = await classroom.courses.courseWork.list({
      courseId,
      pageSize: 20,
    });

    const cutoff = Date.now() - CLASSROOM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    return (data.courseWork || [])
      .filter((w) => {
        if (!w.creationTime) return true;

        return new Date(w.creationTime).getTime() >= cutoff;
      })
      .map((w) => ({
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
