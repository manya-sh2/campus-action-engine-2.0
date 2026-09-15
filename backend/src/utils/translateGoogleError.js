const ApiError = require('./ApiError');

/**
 * Maps a googleapis error (Gmail/Classroom/Drive) into an ApiError with a
 * useful application-level message, without leaking raw Google error
 * internals (headers, request config, etc.) to the client.
 */
function translateGoogleError(err, serviceName) {
  const status = err.code || (err.response && err.response.status);

  if (status === 401) {
    return ApiError.unauthorized(`${serviceName} authorization expired. Please reconnect your Google account.`);
  }
  if (status === 403) {
    return ApiError.forbidden(
      `${serviceName} access is forbidden. Check the granted scopes and that the API is enabled in Google Cloud Console.`
    );
  }
  if (status === 404) {
    return ApiError.notFound(`${serviceName} resource not found.`);
  }
  if (status === 429) {
    return new ApiError(429, `${serviceName} rate limit exceeded. Please try again shortly.`);
  }

  return ApiError.badGateway(`${serviceName} request failed.`);
}

module.exports = translateGoogleError;
