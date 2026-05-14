import express, { Application, Request, Response } from 'express';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { createApiRouter } from './routes/index';
import { getPool } from './db/client';
import { logger } from './utils/logger';

const startedAt = new Date();

export function createApp(locationPriority: string[]): Application {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json());

  app.use((req, _res, next) => {
    if (req.path !== '/health') logger.info(`${req.method} ${req.path}`);
    next();
  });

  app.get('/health', async (_req: Request, res: Response) => {
    const uptimeSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    try {
      await getPool().query('SELECT 1');
      res.json({ status: 'ok', db: 'ok', uptime: uptimeSeconds, startedAt });
    } catch (err) {
      logger.error('Health check: DB unreachable', { error: err instanceof Error ? err.message : String(err) });
      res.status(503).json({ status: 'degraded', db: 'unreachable', uptime: uptimeSeconds, startedAt });
    }
  });

  app.use('/api', createApiRouter(locationPriority));

  app.use(errorHandler);

  return app;
}
