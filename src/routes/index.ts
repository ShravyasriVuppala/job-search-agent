import { Router } from 'express';
import { createJobsRouter } from './jobs';
import { createAnalysesRouter, patternsRouter } from './analyses';
import applicationsRouter from './applications';
import interactionsRouter from './interactions';
import runsRouter from './runs';
import { CoverLetterService } from '../services/cover-letter.service';

export function createApiRouter(locationPriority: string[], coverLetterService?: CoverLetterService): Router {
  const router = Router();

  router.use('/jobs', createJobsRouter(locationPriority));
  router.use('/analyses', createAnalysesRouter(coverLetterService));
  router.use('/patterns', patternsRouter);
  router.use('/applications', applicationsRouter);
  router.use('/interactions', interactionsRouter);
  router.use('/runs', runsRouter);

  return router;
}
