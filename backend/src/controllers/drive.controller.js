const driveService = require('../services/google/drive.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');

// GET /api/drive/files?q=resume
const listFiles = asyncHandler(async (req, res) => {
  const files = await driveService.listFiles(req.user.id, { q: req.query.q });
  sendSuccess(res, { data: files });
});

// GET /api/drive/files/:fileId
const getFileMetadata = asyncHandler(async (req, res) => {
  const file = await driveService.getFileMetadata(req.user.id, req.params.fileId);
  sendSuccess(res, { data: file });
});

// POST /api/drive/files (multipart/form-data, field name "file")
const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded. Send multipart/form-data with a "file" field.');
  }

  const uploaded = await driveService.uploadFile(req.user.id, req.file);
  sendSuccess(res, { statusCode: 201, message: 'File uploaded to Drive', data: uploaded });
});

module.exports = { listFiles, getFileMetadata, uploadFile };
