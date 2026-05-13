import http from 'http';
import request from 'supertest';
import { createApp } from '../src/app';
import { ClaudeAnalysisQueryRepository } from '../src/db/claude-analysis.repository';
import { AgentMemoryRepository } from '../src/db/agent-memory.repository';
import { ApplicationRepository } from '../src/db/application.repository';

let server: http.Server;
beforeAll(() => { server = createApp(['remote', 'washington', 'other']).listen(0); });
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => jest.restoreAllMocks());

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fakeJob = {
  jobId: 'job-uuid-1',
  title: 'Senior Engineer',
  company: 'Acme',
  location: 'Remote',
  locationCategory: 'remote',
  applyUrl: 'https://acme.com/jobs/1',
  source: 'jsearch',
  relevanceScore: 88,
  interviewChance: 70,
  overallCategory: 'auto-flag',
  relevanceReasoning: 'Great match',
  insights: 'Remote-first team',
  matchedPatterns: ['kafka_expertise'],
  coverLetterDraft: 'Dear Hiring Manager...',
};

const fakeAnalysisWithJob = {
  job: {
    id: 'job-uuid-1',
    title: 'Senior Engineer',
    company: 'Acme',
    location: 'Remote',
    applyUrl: 'https://acme.com/jobs/1',
    source: 'jsearch',
  },
  analysis: {
    id: 'analysis-uuid-1',
    relevanceScore: 88,
    interviewChance: 70,
    overallCategory: 'auto-flag',
    relevanceReasoning: 'Great match',
    insights: 'Remote-first team',
    matchedPatterns: ['kafka_expertise'],
  },
};

const fakeApplication = {
  id: 'app-uuid-1',
  jobId: 'job-uuid-1',
  appliedAt: new Date('2026-05-12T10:00:00Z'),
  status: 'applied' as const,
  createdAt: new Date('2026-05-12T10:00:00Z'),
  updatedAt: new Date('2026-05-12T10:00:00Z'),
};

const fakeApplicationWithJob = {
  id: 'app-uuid-1',
  jobId: 'job-uuid-1',
  appliedAt: new Date('2026-05-12T10:00:00Z'),
  status: 'applied' as const,
  title: 'Senior Engineer',
  company: 'Acme',
  location: 'Remote',
  applyUrl: 'https://acme.com/jobs/1',
};

// ── GET /api/jobs/auto-flagged ────────────────────────────────────────────────

describe('GET /api/jobs/auto-flagged', () => {
  it('returns flagged jobs with correct shape', async () => {
    jest
      .spyOn(ClaudeAnalysisQueryRepository.prototype, 'getJobsWithAnalysis')
      .mockResolvedValue([fakeJob]);

    const res = await request(server).get('/api/jobs/auto-flagged');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.data.jobs[0].company).toBe('Acme');
    expect(res.body.data.jobs[0].relevanceScore).toBe(88);
  });
});

// ── GET /api/jobs/by-location ─────────────────────────────────────────────────

describe('GET /api/jobs/by-location', () => {
  it('returns jobs for valid category', async () => {
    jest
      .spyOn(ClaudeAnalysisQueryRepository.prototype, 'getJobsByLocation')
      .mockResolvedValue([fakeJob]);

    const res = await request(server).get('/api/jobs/by-location?category=remote');

    expect(res.status).toBe(200);
    expect(res.body.data.category).toBe('remote');
    expect(res.body.count).toBe(1);
  });

  it('returns 400 for invalid category', async () => {
    const res = await request(server).get('/api/jobs/by-location?category=invalid');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/analyses ─────────────────────────────────────────────────────────

describe('GET /api/analyses', () => {
  it('returns paginated analyses with total count', async () => {
    jest
      .spyOn(ClaudeAnalysisQueryRepository.prototype, 'getAllWithJobs')
      .mockResolvedValue({ rows: [fakeAnalysisWithJob], total: 42 });

    const res = await request(server).get('/api/analyses');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(42);
    expect(res.body.data.analyses[0].job.company).toBe('Acme');
    expect(res.body.data.analyses[0].analysis.relevanceScore).toBe(88);
  });
});

// ── GET /api/analyses/:jobId ──────────────────────────────────────────────────

describe('GET /api/analyses/:jobId', () => {
  it('returns single analysis', async () => {
    jest
      .spyOn(ClaudeAnalysisQueryRepository.prototype, 'getWithJob')
      .mockResolvedValue(fakeAnalysisWithJob);

    const res = await request(server).get('/api/analyses/job-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body.data.job.id).toBe('job-uuid-1');
    expect(res.body.data.analysis.overallCategory).toBe('auto-flag');
  });

  it('returns 404 when not found', async () => {
    jest
      .spyOn(ClaudeAnalysisQueryRepository.prototype, 'getWithJob')
      .mockResolvedValue(null);

    const res = await request(server).get('/api/analyses/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/patterns ─────────────────────────────────────────────────────────

describe('GET /api/patterns', () => {
  it('returns aggregated pattern data', async () => {
    jest.spyOn(AgentMemoryRepository.prototype, 'getAll').mockResolvedValue([
      {
        id: 'mem-1',
        patternName: 'focus_distributed_systems',
        patternType: 'tech_preference',
        patternData: {
          topSkills: ['Kafka', 'Java'],
          gaps: ['Go'],
          categories: ['distributed-systems'],
        },
        confidenceScore: 0.75,
        observationCount: 10,
      },
    ]);

    const res = await request(server).get('/api/patterns');

    expect(res.status).toBe(200);
    expect(res.body.data.patterns.topSkillsMatched).toContain('Kafka');
    expect(res.body.data.patterns.recommendedFocus).toContain('distributed systems');
  });
});

// ── POST /api/applications ────────────────────────────────────────────────────

describe('POST /api/applications', () => {
  it('records an application and returns id/jobId/appliedAt', async () => {
    jest
      .spyOn(ApplicationRepository.prototype, 'recordApplication')
      .mockResolvedValue(fakeApplication);

    const res = await request(server)
      .post('/api/applications')
      .send({ jobId: 'job-uuid-1' });

    expect(res.status).toBe(201);
    expect(res.body.data.jobId).toBe('job-uuid-1');
    expect(res.body.data.applicationId).toBe('app-uuid-1');
  });

  it('returns 400 when jobId is missing', async () => {
    const res = await request(server).post('/api/applications').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/applications ─────────────────────────────────────────────────────

describe('GET /api/applications', () => {
  it('returns all applications with job details', async () => {
    jest
      .spyOn(ApplicationRepository.prototype, 'getApplications')
      .mockResolvedValue([fakeApplicationWithJob]);

    const res = await request(server).get('/api/applications');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data.applications[0].company).toBe('Acme');
  });
});

// ── PATCH /api/applications/:jobId ───────────────────────────────────────────

describe('PATCH /api/applications/:jobId', () => {
  it('updates application status', async () => {
    jest
      .spyOn(ApplicationRepository.prototype, 'updateApplicationStatus')
      .mockResolvedValue({ ...fakeApplication, status: 'rejected' });

    const res = await request(server)
      .patch('/api/applications/job-uuid-1')
      .send({ status: 'rejected' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(server)
      .patch('/api/applications/job-uuid-1')
      .send({ status: 'ghosted' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when application does not exist', async () => {
    jest
      .spyOn(ApplicationRepository.prototype, 'updateApplicationStatus')
      .mockResolvedValue(null);

    const res = await request(server)
      .patch('/api/applications/nonexistent')
      .send({ status: 'rejected' });
    expect(res.status).toBe(404);
  });
});
