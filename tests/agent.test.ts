import { TokenBudgetService } from '../src/services/token-budget.service';
import { ClaudeService } from '../src/services/claude.service';
import { AutonomousAgent } from '../src/services/agent.service';
import { ResumeRepository } from '../src/db/resume.repository';
import { AgentMemoryRepository } from '../src/db/agent-memory.repository';
import { RunningAgentContext, Job } from '../src/types';
import { closePool } from '../src/db/client';

afterAll(async () => {
  await closePool();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<RunningAgentContext> = {}): RunningAgentContext {
  return {
    resume: {
      redactedText: 'Senior Software Engineer, 7 years, Java, Spring Boot, Kafka',
      hash: 'abc123',
      metadata: {
        resumeHash: 'abc123',
        resumeRedacted: 'Senior Software Engineer, 7 years, Java, Spring Boot, Kafka',
        isCurrent: true,
        yearsExperience: 7,
        technologies: ['Java', 'Spring Boot', 'Kafka'],
        companies: ['Google', 'Microsoft'],
      },
    },
    memory: [],
    currentStrategy: 'Prioritize remote Java roles',
    jobsToAnalyze: [],
    analyses: [],
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    source: 'test',
    externalId: 'test-1',
    title: 'Senior Software Engineer',
    company: 'Acme Corp',
    description: 'Java, Spring Boot, Kafka — distributed systems role',
    location: 'Remote',
    applyUrl: 'https://acme.com/jobs/1',
    isActive: true,
    ...overrides,
  };
}

function makeMockClaudeService(callResponse = 'Focus on remote Java roles.'): jest.Mocked<ClaudeService> {
  return {
    call: jest.fn().mockResolvedValue(callResponse),
    callWithTools: jest.fn().mockResolvedValue({ content: [], stop_reason: 'end_turn' }),
  } as unknown as jest.Mocked<ClaudeService>;
}

function makeMockResumeRepo(meta = makeContext().resume.metadata): jest.Mocked<ResumeRepository> {
  return { getResumeMetadata: jest.fn().mockResolvedValue(meta) } as unknown as jest.Mocked<ResumeRepository>;
}

function makeMockMemoryRepo(patterns = []): jest.Mocked<AgentMemoryRepository> {
  return {
    getAll: jest.fn().mockResolvedValue(patterns),
    upsertAll: jest.fn().mockResolvedValue(undefined),
    upsertPattern: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AgentMemoryRepository>;
}

const fakeConfig = {
  jobTitles: ['Senior Software Engineer'],
  locationPriority: ['remote', 'washington'],
  claudeApiKey: 'sk-ant-test-key',
} as never;

// ── TokenBudgetService ────────────────────────────────────────────────────────

describe('TokenBudgetService', () => {
  it('returns true when total is within safety margin', () => {
    const budget = new TokenBudgetService();
    expect(budget.validate()).toBe(true);
  });

  it('exposes a budget breakdown with correct buffer', () => {
    const budget = new TokenBudgetService();
    const b = budget.getBudget();
    expect(b.buffer).toBe(b.safetyMargin - b.resume - b.agentMemory - b.jobsToAnalyze);
    expect(b.buffer).toBeGreaterThan(0);
  });

  it('logs budget info on validate()', () => {
    const spy = jest.spyOn(process.stdout, 'write');
    new TokenBudgetService().validate();
    const output = spy.mock.calls.map((c) => c[0].toString()).join('');
    expect(output).toContain('Token budget');
    expect(output).toContain('buffer remaining');
    spy.mockRestore();
  });

  it('locationCaps() distributes 30 jobs across 3 priorities as 15/10/5', () => {
    const budget = new TokenBudgetService();
    const caps = budget.locationCaps(['remote', 'washington', 'other']);
    expect(caps.get('remote')).toBe(15);
    expect(caps.get('washington')).toBe(10);
    expect(caps.get('other')).toBe(5);
    const total = [...caps.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(30);
  });

  it('locationCaps() distributes 30 jobs across 2 priorities as 20/10', () => {
    const budget = new TokenBudgetService();
    const caps = budget.locationCaps(['remote', 'washington']);
    expect(caps.get('remote')).toBe(20);
    expect(caps.get('washington')).toBe(10);
    expect([...caps.values()].reduce((a, b) => a + b, 0)).toBe(30);
  });

  it('locationCaps() assigns all 30 slots to a single priority', () => {
    const budget = new TokenBudgetService();
    const caps = budget.locationCaps(['remote']);
    expect(caps.get('remote')).toBe(30);
  });

  it('locationCaps() returns an empty map for an empty priority list', () => {
    const budget = new TokenBudgetService();
    expect(budget.locationCaps([]).size).toBe(0);
  });
});

// ── ClaudeService ─────────────────────────────────────────────────────────────

describe('ClaudeService', () => {
  it('instantiates without throwing given an API key, model, and maxTokens', () => {
    expect(() => new ClaudeService('sk-ant-test-key-for-unit-tests', 'claude-opus-4-7', 4096)).not.toThrow();
  });

  it('calls the API with the configured model and returns text', async () => {
    const service = new ClaudeService('sk-ant-test-key', 'claude-opus-4-7', 4096);
    // Spy on the internal client.messages.create to verify model selection
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Strategy: focus on remote Java roles.' }],
      stop_reason: 'end_turn',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).client = { messages: { create: mockCreate } };

    const result = await service.call('What is your strategy?');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-7' }),
    );
    expect(result).toContain('Strategy');
  });
});

// ── AutonomousAgent ───────────────────────────────────────────────────────────

describe('AutonomousAgent', () => {
  function makeAgent(
    claudeService = makeMockClaudeService(),
    memoryRepo = makeMockMemoryRepo(),
    resumeRepo = makeMockResumeRepo(),
  ): AutonomousAgent {
    return new AutonomousAgent(
      fakeConfig,
      resumeRepo,
      memoryRepo,
      claudeService,
      new TokenBudgetService(),
    );
  }

  it('observe() loads resume from agentContext and memory from DB', async () => {
    const memoryRepo = makeMockMemoryRepo();
    const agent = makeAgent(makeMockClaudeService(), memoryRepo);

    const ctx = await agent.observe();

    expect(ctx.resume.hash).toBe('abc123');
    expect(memoryRepo.getAll).toHaveBeenCalledTimes(1);
    expect(Array.isArray(ctx.memory)).toBe(true);
  });

  it('assess() returns a non-empty strategy string from Claude', async () => {
    const claude = makeMockClaudeService('Prioritize remote distributed-systems roles at Series B companies.');
    const agent = makeAgent(claude);
    const strategy = await agent.assess(makeContext());

    expect(typeof strategy).toBe('string');
    expect(strategy.length).toBeGreaterThan(0);
    expect(claude.call).toHaveBeenCalledTimes(1);
  });

  it('runDailyLoop() validates token budget before any API call', async () => {
    const claude = makeMockClaudeService();
    const budget = new TokenBudgetService();
    const validateSpy = jest.spyOn(budget, 'validate').mockReturnValue(true);
    const agent = new AutonomousAgent(fakeConfig, makeMockResumeRepo(), makeMockMemoryRepo(), claude, budget);

    await agent.runDailyLoop();

    expect(validateSpy).toHaveBeenCalledTimes(1);
    // validate() is called before assess(), so call order matters
    const validateOrder = validateSpy.mock.invocationCallOrder[0];
    const claudeCallOrder = (claude.call as jest.Mock).mock.invocationCallOrder[0];
    expect(validateOrder).toBeLessThan(claudeCallOrder);
  });

  it('runDailyLoop() halts immediately if token budget is exceeded', async () => {
    const claude = makeMockClaudeService();
    const budget = new TokenBudgetService();
    jest.spyOn(budget, 'validate').mockReturnValue(false);
    const agent = new AutonomousAgent(fakeConfig, makeMockResumeRepo(), makeMockMemoryRepo(), claude, budget);

    await agent.runDailyLoop();

    expect(claude.call).not.toHaveBeenCalled();
  });

  it('analyzeJobs() continues when one job fails, returning the rest', async () => {
    const claude = makeMockClaudeService();
    (claude.call as jest.Mock)
      .mockRejectedValueOnce(new Error('Claude timeout'))  // first job fails
      .mockResolvedValueOnce(
        JSON.stringify({                                    // second job succeeds
          relevance_score: 80,
          interview_chance: 65,
          location_category: 'remote',
          overall_category: 'auto-flag',
          relevance_reasoning: 'Strong Java match',
          insights: 'Distributed systems experience valued',
          matched_patterns: [],
        }),
      );

    const agent = makeAgent(claude);
    const jobs = [makeJob({ id: 'j1', title: 'Job 1' }), makeJob({ id: 'j2', title: 'Job 2' })];
    const analyses = await agent.analyzeJobs(jobs, makeContext());

    expect(analyses).toHaveLength(1);
    expect(analyses[0].relevance_score).toBe(80);
  });

  it('analyzeJob() parses Claude JSON response into a JobAnalysis', async () => {
    const jsonResponse = JSON.stringify({
      relevance_score: 88,
      interview_chance: 70,
      location_category: 'remote',
      overall_category: 'auto-flag',
      relevance_reasoning: 'Perfect Java/Kafka match',
      insights: 'Company uses distributed systems at scale',
      matched_patterns: ['kafka_expertise'],
      cover_letter_draft: 'I am excited to apply...',
    });
    const claude = makeMockClaudeService(jsonResponse);
    const agent = makeAgent(claude);

    const analysis = await agent.analyzeJob(makeJob(), makeContext());

    expect(analysis.relevance_score).toBe(88);
    expect(analysis.overall_category).toBe('auto-flag');
    expect(analysis.matched_patterns).toContain('kafka_expertise');
    expect(analysis.cover_letter_draft).toBeTruthy();
  });

  it('learnPatterns() returns empty array when no analyses provided', async () => {
    const agent = makeAgent();
    const patterns = await agent.learnPatterns([], []);
    expect(patterns).toHaveLength(0);
  });

  it('selectJobsForAnalysis() respects per-location caps and total cap', () => {
    // fakeConfig has locationPriority: ['remote', 'washington']
    // 2 priorities → caps: remote=20, washington=10
    const agent = makeAgent();
    const jobs = [
      ...Array.from({ length: 25 }, (_, i) =>
        makeJob({ id: `r${i}`, externalId: `r${i}`, locationCategory: 'remote' }),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        makeJob({ id: `w${i}`, externalId: `w${i}`, locationCategory: 'washington' }),
      ),
    ];

    const selected = agent.selectJobsForAnalysis(jobs);

    const remoteCount = selected.filter((j) => j.locationCategory === 'remote').length;
    const washingtonCount = selected.filter((j) => j.locationCategory === 'washington').length;

    // Supply exceeds caps in both locations, so we should hit the caps exactly
    expect(selected.length).toBe(30);
    expect(remoteCount).toBe(20);
    expect(washingtonCount).toBe(10);
  });

  it('selectJobsForAnalysis() takes all available jobs when supply is below cap', () => {
    const agent = makeAgent();
    const jobs = [
      makeJob({ id: 'r1', externalId: 'r1', locationCategory: 'remote' }),
      makeJob({ id: 'w1', externalId: 'w1', locationCategory: 'washington' }),
    ];

    const selected = agent.selectJobsForAnalysis(jobs);
    expect(selected).toHaveLength(2);
  });

  it('selectJobsForAnalysis() excludes jobs whose location is not in locationPriority', () => {
    const agent = makeAgent();
    const jobs = [
      makeJob({ id: 'r1', externalId: 'r1', locationCategory: 'remote' }),
      makeJob({ id: 'o1', externalId: 'o1', locationCategory: 'other' }),
    ];

    // fakeConfig locationPriority = ['remote', 'washington'] — 'other' gets cap 0
    const selected = agent.selectJobsForAnalysis(jobs);
    expect(selected.every((j) => j.locationCategory !== 'other')).toBe(true);
  });
});