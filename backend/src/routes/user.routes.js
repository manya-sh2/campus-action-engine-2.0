const express = require('express');
const userController = require('../controllers/user.controller');
const requireAuth = require('../middlewares/auth.middleware');

const router = express.Router();

// POST / remains an unauthenticated Phase 1 dev-only endpoint for
// creating a user profile before Google sign-in exists for them (see
// user.controller.js for the caveat). GET/PATCH /:id are now
// authenticated and ownership-checked (see user.controller.js) - a
// signed-in user can only read/update their own profile, never
// another user's, regardless of what id is in the URL.
router.post('/', userController.createUser);
router.get('/:id', requireAuth, userController.getUserById);
router.patch('/:id', requireAuth, userController.updateUser);

module.exports = router;
