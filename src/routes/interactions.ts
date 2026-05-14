import { Router, Request, Response } from 'express';
import { JobInteractionRepository } from '../db/job-interaction.repository';

const router = Router();
const interactionRepo = new JobInteractionRepository();

router.patch('/:jobId', async (req: Request, res: Response) => {
  const jobId = req.params['jobId'] as string;
  const { type, active } = req.body as { type?: string; active?: boolean };

  if (type !== 'saved' && type !== 'not_interested') {
    res.status(400).json({ success: false, error: 'type must be "saved" or "not_interested"' });
    return;
  }
  if (typeof active !== 'boolean') {
    res.status(400).json({ success: false, error: 'active must be a boolean' });
    return;
  }

  await interactionRepo.setInteraction(jobId, type, active);
  res.json({ success: true, data: { jobId, type, active } });
});

export default router;
