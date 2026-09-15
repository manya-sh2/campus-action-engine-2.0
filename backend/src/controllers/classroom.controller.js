const classroomService = require('../services/google/classroom.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

// GET /api/classroom/courses
const getCourses = asyncHandler(async (req, res) => {
  const courses = await classroomService.getCourses(req.user.id);
  sendSuccess(res, { data: courses });
});

// GET /api/classroom/announcements?courseId=...
const getAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await classroomService.getAnnouncements(req.user.id, req.query.courseId);
  sendSuccess(res, { data: announcements });
});

// GET /api/classroom/coursework?courseId=...
const getCourseWork = asyncHandler(async (req, res) => {
  const courseWork = await classroomService.getCourseWork(req.user.id, req.query.courseId);
  sendSuccess(res, { data: courseWork });
});

// GET /api/classroom/courses/:courseId/coursework/:courseWorkId
const getCourseWorkDetails = asyncHandler(async (req, res) => {
  const { courseId, courseWorkId } = req.params;
  const details = await classroomService.getCourseWorkDetails(req.user.id, courseId, courseWorkId);
  sendSuccess(res, { data: details });
});

module.exports = { getCourses, getAnnouncements, getCourseWork, getCourseWorkDetails };
