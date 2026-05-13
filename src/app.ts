import express from 'express';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';
import { logger } from './utils/logger';

const app = express();

app.use(corsMiddleware);
app.use(express.json());

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.use('/api', apiRouter);

app.use(errorHandler);

export default app;
