const http = require('http');
const app = require('./app');
const env = require('./config/env');
const connectDB = require('./config/db');
const { initSocket } = require('./services/realtime/socket.service');
const { startDeadlineCron, stopDeadlineCron } = require('./services/cron/deadline.cron');

// The server must not start accepting traffic until MongoDB is
// successfully connected, so we await the connection first.
async function start() {
  try {
    await connectDB();

    if (!env.GOOGLE_MOCK_MODE) {
      const requiredForGoogle = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY'];
      const missing = requiredForGoogle.filter((key) => !env[key]);
      if (missing.length > 0) {
        console.warn(
          `[server] Warning: Google OAuth is not fully configured (missing: ${missing.join(', ')}). ` +
            'Google-dependent endpoints will fail until these are set in .env, or set GOOGLE_MOCK_MODE=true for local testing without real credentials.'
        );
      }
    } else {
      console.log('[server] GOOGLE_MOCK_MODE is enabled - Gmail/Classroom/Drive endpoints will return mock data.');
    }

    if (!env.OPENAI_MOCK_MODE) {
      if (!env.OPENAI_API_KEY) {
        console.warn(
          '[server] Warning: OPENAI_API_KEY is not set. POST /api/tasks/sync will fail until it is set in .env, ' +
            'or set OPENAI_MOCK_MODE=true for local testing without an OpenAI API key.'
        );
      }
    } else {
      console.log('[server] OPENAI_MOCK_MODE is enabled - task sync will use a rule-based mock extractor instead of OpenAI.');
    }

    const server = http.createServer(app);

    // Socket.IO attaches to the same underlying HTTP server as the REST
    // API - one process, one port, no separate infrastructure.
    initSocket(server);

    startDeadlineCron();

    server.listen(env.PORT, () => {
      console.log(`[server] Campus Action Engine API listening on port ${env.PORT} (${env.NODE_ENV})`);
      console.log(`[server] Socket.IO and MCP (/mcp) are attached to the same server.`);
    });

    const shutdown = (signal) => {
      console.log(`\n[server] Received ${signal}, shutting down gracefully...`);
      stopDeadlineCron();
      server.close(() => {
        console.log('[server] HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[server] Failed to start due to MongoDB connection error:');
    console.error(err.message);
    process.exit(1);
  }
}

start();
