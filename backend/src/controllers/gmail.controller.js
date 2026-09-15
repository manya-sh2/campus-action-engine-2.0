const gmailService = require('../services/google/gmail.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

// GET /api/gmail/messages
const getMessages = asyncHandler(async (req, res) => {
  const { q, maxResults } = req.query;
  const messages = await gmailService.getMessages(req.user.id, {
    q,
    maxResults: maxResults ? Number(maxResults) : undefined,
  });
  sendSuccess(res, { data: messages });
});

// GET /api/gmail/messages/:messageId
const getMessageById = asyncHandler(async (req, res) => {
  const message = await gmailService.getMessageById(req.user.id, req.params.messageId);
  sendSuccess(res, { data: message });
});

module.exports = { getMessages, getMessageById };
