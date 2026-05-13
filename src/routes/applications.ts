import { Router, Request, Response } from 'express';
import { ApplicationRepository } from '../db/application.repository';
import { ApplicationStatus } from '../types';

const router = Router();
const appRepo = new ApplicationRepository();

const VALID_STATUSES: ApplicationStatus[] = [
  'applied',
  'interview_scheduled',
  'rejected',
  'offer',
  'archived',
];

router.post('/', async (req: Request, res: Response) => {
  const { jobId } = req.body as { jobId?: string };
  if (!jobId) {
    res.status(400).json({ success: false, error: 'jobId is required' });
    return;
  }
  const application = await appRepo.recordApplication(jobId);
  res.status(201).json({
    success: true,
    data: {
      applicationId: application.id,
      jobId: application.jobId,
      appliedAt: application.appliedAt,
    },
  });
});

router.get('/', async (req: Request, res: Response) => {
  const statusFilter = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
  const applications = await appRepo.getApplications();
  const filtered = statusFilter
    ? applications.filter((a) => a.status === statusFilter)
    : applications;
  res.json({ success: true, data: { applications: filtered }, count: filtered.length });
});

router.patch('/:jobId', async (req: Request, res: Response) => {
  const jobId = req.params['jobId'] as string;
  const { status } = req.body as { status?: string };

  if (!status || !VALID_STATUSES.includes(status as ApplicationStatus)) {
    res.status(400).json({
      success: false,
      error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
    });
    return;
  }

  const updated = await appRepo.updateApplicationStatus(jobId, status as ApplicationStatus);
  if (!updated) {
    res.status(404).json({ success: false, error: 'Application not found for this job' });
    return;
  }

  res.json({
    success: true,
    data: {
      jobId: updated.jobId,
      status: updated.status,
      updatedAt: updated.updatedAt,
    },
  });
});

export default router;
