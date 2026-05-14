import express, { Application } from 'express';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { createApiRouter } from './routes/index';
import { logger } from './utils/logger';

export function createApp(locationPriority: string[]): Application {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json());

  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  app.use('/api', createApiRouter(locationPriority));

  app.use(errorHandler);

  return app;
}
