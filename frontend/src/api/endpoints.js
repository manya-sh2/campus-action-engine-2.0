import { api, API_BASE } from './client';

// --- Auth (Phase 2) ---
export const authApi = {
  // Full-page redirect - OAuth requires a real browser navigation, not fetch.
  startGoogleLogin: () => {
    window.location.href = `${API_BASE}/api/auth/google`;
  },
  me: () => api.get('/api/auth/me'),
  logout: () => api.post('/api/auth/logout'),
};

// --- User profile (Phase 1, now authenticated) ---
// GET/PATCH /api/users/:id require the session cookie (sent automatically
// by the api client) and are ownership-checked server-side - the backend
// rejects any id that isn't the signed-in user's own, regardless of what
// the frontend sends. The frontend only ever calls this with the id from
// authApi.me(), i.e. your own id, but the real enforcement is server-side.
export const userApi = {
  updateProfile: (userId, updates) => api.patch(`/api/users/${userId}`, updates),
};

// --- Tasks (Phase 3 + 4) ---
export const taskApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));
    const qs = query.toString();
    return api.get(`/api/tasks${qs ? `?${qs}` : ''}`);
  },
  highPriority: () => api.get('/api/tasks/priority/high'),
  getById: (taskId) => api.get(`/api/tasks/${taskId}`),
  updateStatus: (taskId, status) => api.patch(`/api/tasks/${taskId}/status`, { status }),
  sync: (options = {}) => api.post('/api/tasks/sync', options),
};

// --- Drive (Phase 2 + 4) ---
export const driveApi = {
  search: (q) => api.get(`/api/drive/files${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/api/drive/files', form);
  },
};
