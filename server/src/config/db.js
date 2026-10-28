import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Unknown filter paths are dropped. Operator injection ({ "$ne": null }) is blocked earlier:
// every route validates input with Zod into primitive types, and middleware/sanitize.js
// rejects any request key that starts with "$".
mongoose.set('strictQuery', true);

export async function connectDB(uri) {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, autoIndex: true });
  // Make sure unique indexes (e.g. the room-night lock) exist before traffic arrives.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  logger.info(`MongoDB connected (${mongoose.connection.host}/${mongoose.connection.name})`);
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

export function dbState() {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown';
}
