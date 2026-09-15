// Small helper to keep success response shape consistent across controllers.
function sendSuccess(res, { statusCode = 200, message, data } = {}) {
  const body = { success: true };
  if (message !== undefined) body.message = message;
  if (data !== undefined) body.data = data;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
