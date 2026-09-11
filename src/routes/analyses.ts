import { Router, Request, Response } from 'express';
import { ClaudeAnalysisQueryRepository } from '../db/claude-analysis.repository';
import { AgentMemoryRepository } from '../db/agent-memory.repository';
import { CoverLetterService } from '../services/cover-letter.service';
import { logger } from '../utils/logger';

const queryRepo = new ClaudeAnalysisQueryRepository();
const memoryRepo = new AgentMemoryRepository();

// Factory so the cover-letter route can receive a configured CoverLetterService (which needs the
// Claude API key/model). When none is supplied (e.g. in tests), that route returns 503.
export function createAnalysesRouter(coverLetterService?: CoverLetterService): Router {
  const router = Router();

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

  // Generate (or return the already-stored) cover letter for a job, on demand.
  router.post('/:jobId/cover-letter', async (req: Request, res: Response) => {
    if (!coverLetterService) {
      res.status(503).json({ success: false, error: 'Cover letter generation is not configured' });
      return;
    }
    const jobId = req.params['jobId'] as string;
    try {
      const draft = await coverLetterService.getOrCreate(jobId);
      if (draft === null) {
        res.status(404).json({ success: false, error: 'Analysis not found for this job' });
        return;
      }
      res.json({ success: true, data: { coverLetterDraft: draft } });
    } catch (err) {
      logger.error('Cover letter generation failed', {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ success: false, error: 'Cover letter generation failed' });
    }
  });

  return router;
}

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
