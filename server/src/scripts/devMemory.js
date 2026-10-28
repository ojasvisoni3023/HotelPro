/**
 * Zero-setup local demo: starts an in-memory MongoDB, seeds demo data and runs the API.
 * Data disappears when the process stops. For real development use MongoDB Atlas + `npm run dev`.
 *
 *   npm run dev:memory
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('hotelpro');
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || `dev-memory-only-${Math.random().toString(36).slice(2)}-${Date.now()}-secret-key`;

const { start } = await import('../server.js');
const { seedDatabase, printSeedSummary, generateDemoPassword } = await import('./seed.js');
await start();
const result = await seedDatabase({ password: process.env.SEED_DEMO_PASSWORD || generateDemoPassword() });
printSeedSummary(result);
console.log('In-memory database: data will be lost when you stop this process (Ctrl+C).');

const stop = async () => {
  await mongod.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
