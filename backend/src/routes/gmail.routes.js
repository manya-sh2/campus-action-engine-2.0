const express = require('express');
const requireAuth = require('../middlewares/auth.middleware');
const gmailController = require('../controllers/gmail.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/messages', gmailController.getMessages);
router.get('/messages/:messageId', gmailController.getMessageById);

module.exports = router;
