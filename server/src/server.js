import { pathToFileURL } from 'node:url';
import config from './config/index.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { sweepExpiredHolds } from './services/availabilityService.js';
import logger from './utils/logger.js';

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { message: reason?.message ?? String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', { message: err.message, stack: err.stack });
  process.exit(1);
});

export async function start() {
  await connectDB(config.mongoUri);
  const app = createApp();
  // Bind to 0.0.0.0 and the platform-provided PORT (required by Render).
  const server = app.listen(config.port, config.host, () => {
    logger.info(`HotelPro API listening on http://${config.host}:${config.port} (${config.env}, payments: ${config.payment.provider})`);
  });

  // Release unpaid holds every minute.
  const sweeper = setInterval(() => sweepExpiredHolds().catch((e) => logger.error('Hold sweep failed', { message: e.message })), 60_000);
  sweeper.unref();

  const shutdown = async (signal) => {
    logger.info(`${signal} received — closing server`);
    clearInterval(sweeper);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

// Run when executed directly (node src/server.js), not when imported by scripts.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((err) => {
    logger.error(`Failed to start: ${err.message}`);
    process.exit(1);
  });
}
