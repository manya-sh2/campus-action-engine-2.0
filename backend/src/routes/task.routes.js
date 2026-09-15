const express = require('express');
const requireAuth = require('../middlewares/auth.middleware');
const taskController = require('../controllers/task.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/sync', taskController.syncTasks);
router.get('/priority/high', taskController.getHighPriorityTasks);
router.get('/:taskId', taskController.getTaskById);
router.patch('/:taskId/status', taskController.updateTaskStatus);
router.get('/', taskController.listTasks);

module.exports = router;
