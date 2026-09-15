const ApiError = require('../utils/ApiError');

// Catches any request that didn't match a defined route
// and forwards a 404 ApiError to the centralized error handler.
function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;
