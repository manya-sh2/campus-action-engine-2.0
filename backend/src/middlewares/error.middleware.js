const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// Translates known error types (ApiError, Mongoose validation/cast errors,
// duplicate key errors) into a consistent status code + message.
// Anything unrecognized falls back to a generic 500.
function normalizeError(err) {
  if (err instanceof ApiError) {
    return { statusCode: err.statusCode, message: err.message, details: err.details };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => e.message);
    return { statusCode: 400, message: 'Validation failed', details };
  }

  // Mongoose invalid ObjectId / cast error
  if (err.name === 'CastError') {
    return { statusCode: 400, message: `Invalid value for field '${err.path}'` };
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return { statusCode: 409, message: `Duplicate value for '${field}'` };
  }

  // Multer (file upload) error, e.g. file too large
  if (err.name === 'MulterError') {
    return { statusCode: 400, message: `File upload error: ${err.message}` };
  }

  return { statusCode: err.statusCode || 500, message: err.message || 'Internal server error' };
}

// Express error-handling middleware. Must have 4 args to be recognized as such.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { statusCode, message, details } = normalizeError(err);

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  const body = {
    success: false,
    message,
  };

  if (details !== undefined) {
    body.error = details;
  }

  // Only leak stack traces outside production, and only for unexpected errors.
  if (env.NODE_ENV !== 'production' && statusCode >= 500) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

module.exports = errorHandler;
