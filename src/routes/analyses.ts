import { Router, Request, Response } from 'express';
import { ClaudeAnalysisQueryRepository } from '../db/claude-analysis.repository';
import { AgentMemoryRepository } from '../db/agent-memory.repository';

const router = Router();
const queryRepo = new ClaudeAnalysisQueryRepository();
const memoryRepo = new AgentMemoryRepository();

router.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query['limit'] as string) ?? '50', 10) || 50, 100);
  const offset = parseInt((req.query['offset'] as string) ?? '0', 10) || 0;
  const { rows: analyses, total } = await queryRepo.getAllWithJobs(limit, offset);
  res.json({ success: true, data: { analyses }, count: total });
});

router.get('/:jobId', async (req: Request, res: Response) => {
  const jobId = req.params['jobId'] as string;
  const result = await queryRepo.getWithJob(jobId);
  if (!result) {
    res.status(404).json({ success: false, error: 'Analysis not found for this job' });
    return;
  }
  res.json({ success: true, data: result });
});

const patternsRouter = Router();

patternsRouter.get('/', async (_req: Request, res: Response) => {
  const patterns = await memoryRepo.getAll();
  const topSkillsMatched: string[] = [];
  const commonGaps: string[] = [];
  const recommendedFocus: string[] = [];
  const bestJobCategories: string[] = [];

  for (const p of patterns) {
    const data = p.patternData as Record<string, unknown>;
    if (Array.isArray(data['topSkills'])) topSkillsMatched.push(...(data['topSkills'] as string[]));
    if (Array.isArray(data['gaps'])) commonGaps.push(...(data['gaps'] as string[]));
    if (Array.isArray(data['categories'])) bestJobCategories.push(...(data['categories'] as string[]));
    if (p.patternName.startsWith('focus_')) {
      recommendedFocus.push(p.patternName.replace(/^focus_/, '').replace(/_/g, ' '));
    }
  }

  res.json({
    success: true,
    data: {
      patterns: {
        topSkillsMatched: [...new Set(topSkillsMatched)],
        commonGaps: [...new Set(commonGaps)],
        recommendedFocus: [...new Set(recommendedFocus)],
        bestJobCategories: [...new Set(bestJobCategories)],
      },
    },
  });
});

export { patternsRouter };
export default router;
