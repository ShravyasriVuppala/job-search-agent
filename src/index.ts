import { validateAndLoadConfig } from './config/config';
import { logger } from './utils/logger';
import { getPool, testConnection, closePool } from './db/client';

async function main(): Promise<void> {
  try {
    const config = validateAndLoadConfig();
    logger.info('Config validated', { nodeEnv: config.nodeEnv });

    getPool();
    await testConnection();
    logger.info('Database connected');

    logger.info('System ready');
  } catch (error) {
    logger.error('Startup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down');
  await closePool();
  process.exit(0);
});

main();