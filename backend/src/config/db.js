const mongoose = require('mongoose');
const env = require('./env');

/**
 * Connects to MongoDB using Mongoose.
 * The server should not start listening until this resolves successfully.
 * Throws on failure so the caller can decide to exit the process.
 */
async function connectDB() {
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.MONGODB_URI);

  console.log(`[db] Connected to MongoDB: ${mongoose.connection.name}`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB disconnected');
  });

  return mongoose.connection;
}

module.exports = connectDB;
