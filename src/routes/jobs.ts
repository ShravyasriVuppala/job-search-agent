import { Router, Request, Response } from 'express';
import { ClaudeAnalysisQueryRepository } from '../db/claude-analysis.repository';
import type { JobDetailResult } from '../db/claude-analysis.repository';

export function createJobsRouter(locationPriority: string[]): Router {
  const router = Router();
  const queryRepo = new ClaudeAnalysisQueryRepository();

  router.get('/all', async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query['limit'] ?? ''), 10) || 200, 500);
    const offset = parseInt(String(req.query['offset'] ?? ''), 10) || 0;
    const { rows, total } = await queryRepo.getAllJobs(limit, offset);
    res.json({ success: true, data: { jobs: rows }, count: total });
  });

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

  // Must be last — wildcard matches any /:id
  router.get('/:id', async (req: Request, res: Response) => {
    const result = await queryRepo.getJobWithOptionalAnalysis(req.params['id'] as string);
    if (!result) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }
    res.json({ success: true, data: result });
  });

  return router;
}
