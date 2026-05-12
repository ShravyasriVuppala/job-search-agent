import { Config, Job, AgentMemory, JobAnalysis, RunningAgentContext, SearchCriteria } from '../types';
import { ClaudeService } from './claude.service';
import { TokenBudgetService } from './token-budget.service';
import { JobAggregatorService } from './job-aggregator.service';
import { ResumeRepository } from '../db/resume.repository';
import { AgentMemoryRepository } from '../db/agent-memory.repository';
import { agentContext } from '../agent/context';
import { logger } from '../utils/logger';

// Context breakdown per daily run:
// - Resume: 3K tokens (loaded once at startup, reused across all job analyses)
// - Agent memory: 5K tokens (learned patterns, fresh daily from DB)
// - Jobs to analyze: 50K tokens (40-50 job descriptions)
// - Total: 58K input tokens
// - Available: 200K context window
// - Safety margin: 150K (never exceed)
// - Cost: ~$0.26/day, ~$7.80/month

// Claude uses full context (resume, memory, strategy) to reason about each job.
// No hardcoded rules like "if relevance_score > 75 then auto-flag".
// Claude decides. Agent learns and improves over time.

function determineLocationCategory(location?: string): 'remote' | 'washington' | 'other' {
  if (!location) return 'other';
  const l = location.toLowerCase();
  if (l.includes('remote')) return 'remote';
  if (
    l.includes('washington') ||
    l.includes('seattle') ||
    l.includes('bellevue') ||
    l.includes('redmond') ||
    l.includes(', wa')
  )
    return 'washington';
  return 'other';
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in Claude response');
  return JSON.parse(match[0]) as T;
}

export class AutonomousAgent {
  constructor(
    private readonly config: Config,
    private readonly resumeRepository: ResumeRepository,
    private readonly agentMemoryRepository: AgentMemoryRepository,
    private readonly claudeService: ClaudeService,
    private readonly tokenBudget: TokenBudgetService,
    private readonly jobAggregator?: JobAggregatorService,
  ) {}

  async runDailyLoop(): Promise<void> {
    // Step 1: VALIDATE TOKEN BUDGET (proactive enforcement before any API calls)
    if (!this.tokenBudget.validate()) {
      logger.error('Token budget exceeded. Aborting agent run.');
      return;
    }

    // Step 2: OBSERVE — load resume, memory, recent applications
    const context = await this.observe();
    logger.info('Observed context', { resumeHash: context.resume.hash });

    // Step 3: ASSESS — Claude reasons about today's strategy
    const strategy = await this.assess(context);
    context.currentStrategy = strategy;
    logger.info('Agent assessed strategy', { strategy: strategy.slice(0, 120) });

    // Step 4: FETCH — get new jobs (implemented in Phase 4)
    const jobs = await this.fetchJobs();
    context.jobsToAnalyze = jobs;
    logger.info(`Fetched ${jobs.length} new jobs`);

    // Step 5: ANALYZE — Claude scores each job against the full context
    const analyses = await this.analyzeJobs(jobs, context);
    context.analyses = analyses;
    logger.info(`Analyzed ${analyses.length} jobs`);

    // Step 6: LEARN — Claude identifies patterns from today's results
    const patterns = await this.learnPatterns(analyses, jobs);
    logger.info(`Identified ${patterns.length} patterns`);

    // Step 7: STORE — persist results to DB
    await this.agentMemoryRepository.upsertAll(patterns);
    logger.info('Agent run complete');
  }

  async observe(): Promise<RunningAgentContext> {
    const resume = agentContext.resume ?? (await this.loadResumeFromDb());
    const memory = await this.agentMemoryRepository.getAll();
    return {
      resume,
      memory,
      currentStrategy: '',
      jobsToAnalyze: [],
      analyses: [],
    };
  }

  async assess(context: RunningAgentContext): Promise<string> {
    const { metadata } = context.resume;
    const memoryLines =
      context.memory.length > 0
        ? context.memory
            .map((p) => `- ${p.patternName}: confidence ${p.confidenceScore.toFixed(2)}`)
            .join('\n')
        : '- No patterns learned yet (first run)';

    const prompt = `You are an autonomous job search agent.

USER PROFILE:
${metadata.yearsExperience ?? 'Unknown'} years experience
Technologies: ${(metadata.technologies ?? []).join(', ')}
Companies: ${(metadata.companies ?? []).join(', ')}
Preferred titles: ${this.config.jobTitles.join(', ')}
Location priority: ${this.config.locationPriority.join(', ')}

LEARNED PATTERNS:
${memoryLines}

What is your strategy for today's job analysis?
Consider: What patterns are strongest? What locations should we prioritize? What companies look promising?
Be concise (2-3 sentences).`;

    return this.claudeService.call(prompt);
  }

  async fetchJobs(): Promise<Job[]> {
    if (!this.jobAggregator) {
      logger.info('No job aggregator configured — returning empty list');
      return [];
    }
    const criteria: SearchCriteria = {
      jobTitles: this.config.jobTitles,
      locationPriority: this.config.locationPriority,
      yearsExperience: this.config.yearsExperience,
      preferredStack: this.config.preferredTechnicalStack,
    };
    return this.jobAggregator.fetchAndStoreJobs(criteria);
  }

  async analyzeJobs(jobs: Job[], context: RunningAgentContext): Promise<JobAnalysis[]> {
    const analyses: JobAnalysis[] = [];
    for (const job of jobs) {
      try {
        const analysis = await this.analyzeJob(job, context);
        analyses.push(analysis);
        if (analyses.length % 10 === 0) {
          logger.info(`Analyzed ${analyses.length}/${jobs.length} jobs`);
        }
      } catch (err) {
        logger.error(`Failed to analyze job ${job.id ?? job.title} — skipping`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return analyses;
  }

  async analyzeJob(job: Job, context: RunningAgentContext): Promise<JobAnalysis> {
    const memoryLines =
      context.memory.length > 0
        ? context.memory.map((p) => `- ${p.patternName}: ${p.confidenceScore.toFixed(2)}`).join('\n')
        : '- None yet';

    const prompt = `You are an autonomous job search agent.

USER PROFILE (redacted — no PII):
${context.resume.redactedText}

LEARNED PATTERNS:
${memoryLines}

TODAY'S STRATEGY:
${context.currentStrategy}

JOB TO ANALYZE:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'Not specified'}
Description: ${job.description}

Score this job on:
1. Relevance to the user's profile (0-100)
2. Likelihood of interview if they apply (0-100)
3. Does it match any learned patterns?
4. If relevance_score > 75, draft a short (3-5 sentence) cover letter opener

Respond with ONLY valid JSON (no markdown):
{
  "relevance_score": <number 0-100>,
  "interview_chance": <number 0-100>,
  "location_category": "remote" | "washington" | "other",
  "overall_category": "auto-flag" | "needs-review" | "skip",
  "relevance_reasoning": "<one sentence>",
  "insights": "<one sentence>",
  "matched_patterns": ["<pattern name>"],
  "cover_letter_draft": "<optional, only if relevance_score > 75>"
}`;

    const text = await this.claudeService.call(prompt);

    type RawAnalysis = {
      relevance_score: number;
      interview_chance: number;
      location_category?: string;
      overall_category: string;
      relevance_reasoning: string;
      insights: string;
      matched_patterns: string[];
      cover_letter_draft?: string;
    };

    const raw = extractJson<RawAnalysis>(text);

    return {
      job_id: job.id ?? '',
      company: job.company,
      relevance_score: raw.relevance_score,
      interview_chance: raw.interview_chance,
      location_category: raw.location_category ?? determineLocationCategory(job.location),
      overall_category: raw.overall_category,
      relevance_reasoning: raw.relevance_reasoning,
      insights: raw.insights,
      matched_patterns: raw.matched_patterns ?? [],
      cover_letter_draft: raw.cover_letter_draft,
    };
  }

  async learnPatterns(analyses: JobAnalysis[], jobs: Job[]): Promise<Pick<AgentMemory, 'patternName' | 'patternType' | 'patternData' | 'confidenceScore' | 'observationCount'>[]> {
    if (analyses.length === 0) {
      logger.info('No analyses to learn from — skipping pattern learning');
      return [];
    }

    const jobMap = new Map(jobs.map((j) => [j.id ?? '', j]));
    const highValueLines = analyses
      .filter((a) => a.relevance_score >= 75)
      .map((a) => `- ${a.company}: patterns=[${a.matched_patterns.join(', ')}] score=${a.relevance_score}`)
      .join('\n');

    const prompt = `You analyzed ${analyses.length} jobs today.

HIGH-VALUE JOBS (relevance ≥ 75):
${highValueLines || '- None found today'}

ALL RESULTS SUMMARY:
- Auto-flagged: ${analyses.filter((a) => a.overall_category === 'auto-flag').length}
- Needs review: ${analyses.filter((a) => a.overall_category === 'needs-review').length}
- Skipped: ${analyses.filter((a) => a.overall_category === 'skip').length}

What patterns do you observe?
- Did certain companies appear multiple times with high scores?
- Did certain technologies dominate high-value jobs?
- Is there a location trend?

For each pattern, estimate confidence (0.0-1.0) based on evidence strength.
Respond with ONLY valid JSON (no markdown):
{
  "patterns": [
    {
      "name": "<snake_case_pattern_name>",
      "type": "company_success" | "tech_preference" | "location_trend" | "industry_fit",
      "confidence": <number 0.0-1.0>,
      "observation_count": <number>
    }
  ]
}`;

    const text = await this.claudeService.call(prompt);

    type RawPattern = {
      name: string;
      type: string;
      confidence: number;
      observation_count: number;
    };
    type RawResponse = { patterns: RawPattern[] };

    const raw = extractJson<RawResponse>(text);

    return (raw.patterns ?? []).map((p) => ({
      patternName: p.name,
      patternType: p.type,
      patternData: {},
      confidenceScore: Math.min(Math.max(p.confidence, 0), 1),
      observationCount: p.observation_count ?? 1,
    }));
  }

  private async loadResumeFromDb(): Promise<RunningAgentContext['resume']> {
    const meta = await this.resumeRepository.getResumeMetadata();
    if (!meta) throw new Error('No resume found in DB — run startup first');
    return {
      redactedText: meta.resumeRedacted,
      hash: meta.resumeHash,
      metadata: meta,
    };
  }
}