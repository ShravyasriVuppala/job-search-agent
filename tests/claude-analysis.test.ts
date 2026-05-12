import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAnalysisService } from '../src/services/claude-analysis.service';
import { ClaudeAnalysisRepository } from '../src/db/claude-analysis.repository';
import { Job, JobAnalysis, JobAnalysisResult } from '../src/types';
import { getPool, closePool } from '../src/db/client';

jest.mock('../src/db/client');
const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;

afterAll(async () => {
  await closePool();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    source: 'jsearch',
    externalId: 'j-001',
    title: 'Senior Software Engineer',
    company: 'Stripe',
    description: 'Java, Kafka, distributed systems role requiring 5+ years',
    location: 'Remote',
    locationCategory: 'remote',
    applyUrl: 'https://stripe.com/jobs/1',
    isActive: true,
    ...overrides,
  };
}

function makeAnalysisResult(overrides: Partial<JobAnalysisResult> = {}): JobAnalysisResult {
  return {
    relevanceScore: 85,
    interviewChance: 70,
    overallCategory: 'auto-flag',
    relevanceReasoning: 'Strong Java and Kafka match with 7 years experience',
    insights: 'Distributed systems focus aligns perfectly with background',
    matchedPatterns: ['java_expert', 'kafka_experience'],
    ...overrides,
  };
}

function makeJobAnalysis(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return {
    job_id: 'j-001',
    company: 'Stripe',
    relevance_score: 85,
    interview_chance: 70,
    location_category: 'remote',
    overall_category: 'auto-flag',
    relevance_reasoning: 'Strong Java and Kafka match',
    insights: 'Distributed systems experience valued',
    matched_patterns: ['java_expert'],
    ...overrides,
  };
}

// Spy on client.messages.create inside a ClaudeAnalysisService instance.
function mockClientCreate(service: ClaudeAnalysisService, responseText: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jest.spyOn((service as any).client.messages, 'create').mockResolvedValue({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-7',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
    content: [{ type: 'text', text: responseText }],
  } as unknown as Anthropic.Message);
}

// ── ClaudeAnalysisService ─────────────────────────────────────────────────────

describe('ClaudeAnalysisService', () => {
  let service: ClaudeAnalysisService;

  beforeEach(() => {
    service = new ClaudeAnalysisService('sk-ant-test-key', 'claude-opus-4-7');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('analyzeJob() parses Claude JSON response into a JobAnalysisResult', async () => {
    mockClientCreate(
      service,
      JSON.stringify({
        relevanceScore: 88,
        interviewChance: 72,
        overallCategory: 'auto-flag',
        relevanceReasoning: 'Strong Java and Kafka match with 7 years experience',
        insights: 'Distributed systems focus aligns with background',
        matchedPatterns: ['java_expert', 'kafka_experience'],
      }),
    );

    const result = await service.analyzeJob(
      makeJob(),
      'Senior Java engineer, 7 years, Kafka, Spring Boot',
      7,
      ['Java', 'Kafka', 'Spring Boot'],
    );

    expect(result.relevanceScore).toBe(88);
    expect(result.interviewChance).toBe(72);
    expect(result.overallCategory).toBe('auto-flag');
    expect(result.matchedPatterns).toContain('java_expert');
    expect(result.relevanceReasoning).toBeTruthy();
  });

  it('analyzeJob() returns skip category for low-relevance jobs', async () => {
    mockClientCreate(
      service,
      JSON.stringify({
        relevanceScore: 22,
        interviewChance: 10,
        overallCategory: 'skip',
        relevanceReasoning: 'Requires Go and Rust expertise not present in resume',
        insights: 'Significant stack mismatch — primarily systems programming',
        matchedPatterns: [],
      }),
    );

    const result = await service.analyzeJob(makeJob(), 'Java engineer resume', 7, ['Java']);

    expect(result.overallCategory).toBe('skip');
    expect(result.relevanceScore).toBe(22);
    expect(result.matchedPatterns).toHaveLength(0);
  });

  it('generateCoverLetter() returns structured opening, body, and closing', async () => {
    mockClientCreate(
      service,
      JSON.stringify({
        opening: 'I am excited to apply for the Senior Software Engineer role at Stripe.',
        body: 'My 7 years of Java and Kafka experience directly aligns with the distributed systems work described.',
        closing: 'Thank you for considering my application.',
      }),
    );

    const result = await service.generateCoverLetter(
      makeJob(),
      makeAnalysisResult(),
      'Senior Java engineer, 7 years',
    );

    expect(result.opening).toContain('Stripe');
    expect(result.body).toBeTruthy();
    expect(result.closing).toBeTruthy();
  });

  it('learnPatterns() returns structured pattern learning from job analyses', async () => {
    mockClientCreate(
      service,
      JSON.stringify({
        topSkillsMatched: ['java', 'kafka', 'spring-boot'],
        commonGaps: ['kubernetes', 'go'],
        recommendedFocus: ['distributed systems', 'fintech scale-ups'],
        bestJobCategories: ['scale-up', 'enterprise'],
      }),
    );

    const analyses = [
      makeJobAnalysis(),
      makeJobAnalysis({ company: 'Shopify', overall_category: 'maybe-flag', relevance_score: 65 }),
    ];
    const result = await service.learnPatterns(analyses);

    expect(result.topSkillsMatched).toContain('java');
    expect(result.commonGaps).toContain('kubernetes');
    expect(result.recommendedFocus).toHaveLength(2);
    expect(result.bestJobCategories).toContain('enterprise');
  });
});

// ── ClaudeAnalysisRepository ──────────────────────────────────────────────────

describe('ClaudeAnalysisRepository', () => {
  const mockQuery = jest.fn();

  beforeEach(() => {
    mockQuery.mockReset();
    mockedGetPool.mockReturnValue({ query: mockQuery } as never);
  });

  it('saveAnalysis() upserts with correct SQL parameters', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const repo = new ClaudeAnalysisRepository();
    await repo.saveAnalysis('job-uuid-1', makeAnalysisResult(), 'remote', 'Cover letter text');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO claude_analysis');
    expect(sql).toContain('ON CONFLICT (job_id) DO UPDATE');
    expect(params[0]).toBe('job-uuid-1');
    expect(params[4]).toBe('auto-flag');
    expect(params[7]).toBe('Cover letter text');
  });

  it('getAnalysesByCategory() queries with category filter and excludes stale rows', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 'analysis-uuid-1',
          job_id: 'job-uuid-1',
          relevance_score: '85.00',
          interview_chance: '70.00',
          location_category: 'remote',
          overall_category: 'auto-flag',
          relevance_reasoning: 'Strong match',
          insights: 'Good fit',
          cover_letter_draft: null,
          matched_patterns: ['java_expert'],
          is_stale: false,
          stale_reason: null,
          analyzed_at: new Date(),
          created_at: new Date(),
        },
      ],
    });

    const repo = new ClaudeAnalysisRepository();
    const results = await repo.getAnalysesByCategory('auto-flag');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('overall_category = $1'),
      ['auto-flag'],
    );
    expect(results).toHaveLength(1);
    expect(results[0].relevanceScore).toBe(85);
    expect(results[0].isStale).toBe(false);
  });
});