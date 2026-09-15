// Every request includes credentials so the backend's httpOnly session
// cookie is sent automatically. The frontend never reads, stores, or
// forwards any token itself - identity comes entirely from that cookie,
// exactly as the backend expects. This file never imports anything
// related to Google/OpenAI tokens because it never sees them.

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

class ApiRequestError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

/**
 * @param {string} path - e.g. '/api/tasks'
 * @param {RequestInit} [options]
 */
async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    // Some responses (e.g. a 500 with no body) may not be JSON at all.
  }

  if (!res.ok) {
    const message = (body && body.message) || `Request failed with status ${res.status}`;
    throw new ApiRequestError(message, res.status, body && body.error);
  }

  return body;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, data) => request(path, { method: 'POST', body: data instanceof FormData ? data : JSON.stringify(data ?? {}) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
};

export { ApiRequestError };
