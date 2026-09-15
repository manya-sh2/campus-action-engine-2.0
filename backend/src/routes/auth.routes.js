const express = require('express');
const authController = require('../controllers/auth.controller');
const requireAuth = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/google', authController.startGoogleAuth);
router.get('/google/callback', authController.handleGoogleCallback);
router.get('/me', requireAuth, authController.getCurrentUser);
router.post('/logout', authController.logout);

module.exports = router;
