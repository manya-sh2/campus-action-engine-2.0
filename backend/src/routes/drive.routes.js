const express = require('express');
const multer = require('multer');
const requireAuth = require('../middlewares/auth.middleware');
const driveController = require('../controllers/drive.controller');

// Memory storage: files are streamed straight to Google Drive and never
// touch this server's disk. 15MB is generous for resumes/documents
// without inviting arbitrarily large uploads.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = express.Router();

router.use(requireAuth);

router.get('/files', driveController.listFiles);
router.get('/files/:fileId', driveController.getFileMetadata);
router.post('/files', upload.single('file'), driveController.uploadFile);

module.exports = router;
