import { Router, Request, Response } from 'express';
import { ClaudeAnalysisQueryRepository } from '../db/claude-analysis.repository';

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
  if (!['remote', 'washington', 'other'].includes(category)) {
    res.status(400).json({ success: false, error: 'category must be remote, washington, or other' });
    return;
  }
  const jobs = await queryRepo.getJobsByLocation(category);
  res.json({ success: true, data: { jobs, category }, count: jobs.length });
});

export default router;
