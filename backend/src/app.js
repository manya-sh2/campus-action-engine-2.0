const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const userRoutes = require('./routes/user.routes');
const authRoutes = require('./routes/auth.routes');
const gmailRoutes = require('./routes/gmail.routes');
const classroomRoutes = require('./routes/classroom.routes');
const driveRoutes = require('./routes/drive.routes');
const taskRoutes = require('./routes/task.routes');
const mcpRoutes = require('./routes/mcp.routes');
const notFound = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/error.middleware');

const app = express();

// --- Core middleware ---
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true, // required so the session cookie is sent/received cross-origin
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Campus Action Engine API is running',
  });
});

// --- Feature routes ---
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/classroom', classroomRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/mcp', mcpRoutes);

// --- 404 + centralized error handling (must stay last) ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
