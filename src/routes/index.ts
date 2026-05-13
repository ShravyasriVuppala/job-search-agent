import { Router } from 'express';
import jobsRouter from './jobs';
import analysesRouter, { patternsRouter } from './analyses';
import applicationsRouter from './applications';

const router = Router();

router.use('/jobs', jobsRouter);
router.use('/analyses', analysesRouter);
router.use('/patterns', patternsRouter);
router.use('/applications', applicationsRouter);

export default router;
