// Wraps an async route handler so rejected promises are forwarded
// to Express's error handling middleware instead of crashing the process
// or requiring a try/catch in every controller.
function asyncHandler(fn) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
