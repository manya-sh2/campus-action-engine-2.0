import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Pinned to port 3000 (strictPort) because the backend's default
// CLIENT_URL - used for both CORS and the OAuth post-login redirect -
// is http://localhost:3000. If you change this, update CLIENT_URL in
// backend/.env to match, or the session cookie won't be sent/accepted.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
})
