const express = require('express');
const requireAuth = require('../middlewares/auth.middleware');
const classroomController = require('../controllers/classroom.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/courses', classroomController.getCourses);
router.get('/announcements', classroomController.getAnnouncements);
router.get('/coursework', classroomController.getCourseWork);
router.get('/courses/:courseId/coursework/:courseWorkId', classroomController.getCourseWorkDetails);

module.exports = router;
