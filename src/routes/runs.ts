import { Router, Request, Response } from 'express';
import { AgentRunRepository } from '../db/agent-run.repository';

const router = Router();
const agentRunRepository = new AgentRunRepository();

router.get('/', async (_req: Request, res: Response) => {
  const runs = await agentRunRepository.getRecentRuns(30);
  res.json({ data: { runs } });
});

export default router;
