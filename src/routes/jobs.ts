import { Router, Request, Response } from 'express';
import { ClaudeAnalysisQueryRepository } from '../db/claude-analysis.repository';

export function createJobsRouter(locationPriority: string[]): Router {
  const router = Router();
  const queryRepo = new ClaudeAnalysisQueryRepository();

  router.get('/auto-flagged', async (_req: Request, res: Response) => {
    const jobs = await queryRepo.getJobsWithAnalysis('auto-flag');
    res.json({ success: true, data: { jobs }, count: jobs.length });
  });

  router.get('/maybe-flagged', async (_req: Request, res: Response) => {
    const jobs = await queryRepo.getJobsWithAnalysis('maybe-flag');
    res.json({ success: true, data: { jobs }, count: jobs.length });
  });

  router.get('/by-location', async (req: Request, res: Response) => {
    const category = typeof req.query['category'] === 'string' ? req.query['category'] : '';
    if (!locationPriority.includes(category)) {
      res
        .status(400)
        .json({ success: false, error: `category must be one of: ${locationPriority.join(', ')}` });
      return;
    }
    const jobs = await queryRepo.getJobsByLocation(category);
    res.json({ success: true, data: { jobs, category }, count: jobs.length });
  });

  return router;
}
