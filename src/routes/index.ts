import { Router } from 'express';
import { createJobsRouter } from './jobs';
import analysesRouter, { patternsRouter } from './analyses';
import applicationsRouter from './applications';
import interactionsRouter from './interactions';
import runsRouter from './runs';

export function createApiRouter(locationPriority: string[]): Router {
  const router = Router();

  router.use('/jobs', createJobsRouter(locationPriority));
  router.use('/analyses', analysesRouter);
  router.use('/patterns', patternsRouter);
  router.use('/applications', applicationsRouter);
  router.use('/interactions', interactionsRouter);
  router.use('/runs', runsRouter);

  return router;
}
