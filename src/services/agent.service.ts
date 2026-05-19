import { Config, Job, AgentMemory, JobAnalysis, RunningAgentContext, SearchCriteria } from '../types';
import { ClaudeService } from './claude.service';
import { TokenBudgetService } from './token-budget.service';
import { JobAggregatorService } from './job-aggregator.service';
import { ClaudeAnalysisService } from './claude-analysis.service';
import { ResumeRepository } from '../db/resume.repository';
import { AgentMemoryRepository } from '../db/agent-memory.repository';
import { JobRepository } from '../db/job.repository';
import { ClaudeAnalysisRepository } from '../db/claude-analysis.repository';
import { ApplicationRepository } from '../db/application.repository';
import { AgentRunRepository } from '../db/agent-run.repository';
import { BatchRunRepository } from '../db/batch-run.repository';
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
    private readonly claudeAnalysisService?: ClaudeAnalysisService,
    private readonly claudeAnalysisRepository?: ClaudeAnalysisRepository,
    private readonly jobRepository?: JobRepository,
    private readonly agentRunRepository?: AgentRunRepository,
    private readonly batchRunRepository?: BatchRunRepository,
  ) {}

  async runDailyLoop(): Promise<void> {
    const runId = await this.agentRunRepository?.startRun();

    try {
      // Step 1: OBSERVE — load resume, memory, recent applications
      const context = await this.observe();
      logger.info('Observed context', { resumeHash: context.resume.hash });

      // Step 2: ASSESS — Claude reasons about today's strategy
      const strategy = await this.assess(context);
      context.currentStrategy = strategy;
      logger.info('Agent assessed strategy', { strategy: strategy.slice(0, 120) });

      // Step 3: FETCH — get new jobs
      const fetched = await this.fetchJobs();
      logger.info(`Fetched ${fetched.length} jobs from APIs`);

      // Step 3a: FILTER — skip jobs already analyzed (avoids re-spending Claude tokens)
      const newJobs = await this.filterUnanalyzed(fetched);
      logger.info(`New (unanalyzed) jobs: ${newJobs.length}/${fetched.length}`);

      // Step 3b: SELECT — apply per-location caps before analysis
      const jobs = this.selectJobsForAnalysis(newJobs);
      context.jobsToAnalyze = jobs;
      logger.info(`Selected ${jobs.length}/${newJobs.length} jobs for analysis`);

      // Step 4: VALIDATE TOKEN BUDGET — using real data, immediately before any Claude spend
      if (!this.tokenBudget.validateForAnalysis(context.resume.redactedText, context.memory, jobs)) {
        logger.error('Token budget exceeded. Aborting agent run.');
        if (runId) await this.agentRunRepository?.failRun(runId, 'Token budget exceeded');
        return;
      }

      if (this.config.useBatchApi) {
        if (jobs.length === 0) {
          logger.info('No new jobs to analyze — skipping batch submission');
          if (runId) {
            await this.agentRunRepository?.completeRun(runId, {
              jobsFetched: fetched.length,
              jobsAnalyzed: 0,
              autoFlagged: 0,
              maybeFlagged: 0,
              skipped: 0,
              patternsUpserted: 0,
              tokensInput: 0,
              tokensOutput: 0,
            });
          }
          return;
        }
        // Step 5 (BATCH): Submit all jobs to Anthropic Message Batches API and exit.
        // The poll-batch script will collect results, learn patterns, and complete the run.
        await this.submitBatch(jobs, context, runId, fetched.length);
        logger.info('Batch submitted — agent exiting. Poller will complete this run.');
        return;
      }

      // Step 5: ANALYZE — Claude scores each job against the full context
      const analyses = await this.analyzeJobs(jobs, context);
      context.analyses = analyses;
      logger.info(`Analyzed ${analyses.length} jobs`);

      // Step 6: LEARN — Claude identifies patterns from today's results
      const patterns = await this.learnPatterns(analyses, jobs);
      logger.info(`Identified ${patterns.length} patterns`);

      // Step 7: STORE — persist results to DB
      await this.agentMemoryRepository.upsertAll(patterns);

      if (runId) {
        const claudeTokens = this.claudeService.getTokenUsage();
        const analysisTokens = this.claudeAnalysisService?.getTokenUsage() ?? { input: 0, output: 0 };
        await this.agentRunRepository?.completeRun(runId, {
          jobsFetched: fetched.length,
          jobsAnalyzed: analyses.length,
          autoFlagged: analyses.filter((a) => a.overall_category === 'auto-flag').length,
          maybeFlagged: analyses.filter((a) => a.overall_category === 'maybe-flag').length,
          skipped: analyses.filter((a) => a.overall_category === 'skip').length,
          patternsUpserted: patterns.length,
          tokensInput: claudeTokens.input + analysisTokens.input,
          tokensOutput: claudeTokens.output + analysisTokens.output,
        });
        logger.info('Token usage for this run', {
          input: claudeTokens.input + analysisTokens.input,
          output: claudeTokens.output + analysisTokens.output,
        });
      }

      logger.info('Agent run complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (runId) await this.agentRunRepository?.failRun(runId, message);
      throw err;
    }
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

    const userContextSection = this.config.userContext
      ? `\nUSER CONTEXT (explicit, highest priority):\n${this.config.userContext}\n`
      : '';
    const yearsExp = metadata.yearsExperience ?? this.config.yearsExperience;
    const prompt = `You are an autonomous job search agent.
${userContextSection}
USER PROFILE:
${yearsExp} years experience
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
      locationKeywords: this.config.locationKeywords,
    };
    return this.jobAggregator.fetchAndStoreJobs(criteria);
  }

  async filterUnanalyzed(jobs: Job[]): Promise<Job[]> {
    if (!this.jobRepository || jobs.length === 0) return jobs;
    const applyUrls = jobs.map((j) => j.applyUrl).filter(Boolean);
    const unanalyzed = await this.jobRepository.getUnanalyzedJobs(applyUrls);
    const unanalyzedUrls = new Set(unanalyzed.map((j) => j.applyUrl));
    // Return the DB records (which have ids) for unanalyzed jobs,
    // preserving the order from the original fetch.
    return unanalyzed.filter((j) => unanalyzedUrls.has(j.applyUrl));
  }

  selectJobsForAnalysis(jobs: Job[]): Job[] {
    const caps = this.tokenBudget.locationCaps(this.config.locationPriority);
    if (caps.size === 0) return jobs.slice(0, this.tokenBudget.maxJobsPerRun);

    // Pass 1: fill each category up to its cap; collect overflow for redistribution
    const counts = new Map<string, number>();
    const selected: Job[] = [];
    const overflow: Job[] = [];

    for (const job of jobs) {
      if (selected.length >= this.tokenBudget.maxJobsPerRun) break;
      const loc = job.locationCategory ?? 'other';
      const cap = caps.get(loc) ?? 0;
      const count = counts.get(loc) ?? 0;
      if (count < cap) {
        selected.push(job);
        counts.set(loc, count + 1);
      } else {
        overflow.push(job);
      }
    }

    logger.info('Location caps for this run', Object.fromEntries(counts));

    // Pass 2: redistribute unused budget — fill remaining slots from overflow in priority order
    if (selected.length < this.tokenBudget.maxJobsPerRun && overflow.length > 0) {
      const remaining = this.tokenBudget.maxJobsPerRun - selected.length;
      const priorityIndex = (cat: string | undefined): number => {
        const idx = this.config.locationPriority.indexOf(cat ?? 'other');
        return idx === -1 ? this.config.locationPriority.length : idx;
      };
      overflow.sort((a, b) => priorityIndex(a.locationCategory) - priorityIndex(b.locationCategory));
      const extras = overflow.slice(0, remaining);
      selected.push(...extras);
      logger.info(`Redistributed ${extras.length} overflow jobs to fill unused budget`);
    }

    return selected;
  }

  private async submitBatch(
    jobs: Job[],
    context: RunningAgentContext,
    runId: string | undefined,
    jobsFetched: number,
  ): Promise<void> {
    if (!this.claudeAnalysisService || !this.batchRunRepository) {
      throw new Error('Batch mode requires claudeAnalysisService and batchRunRepository');
    }

    const batchId = await this.claudeAnalysisService.submitAnalysisBatch(
      jobs,
      context.resume.redactedText,
      context.resume.metadata.yearsExperience ?? this.config.yearsExperience,
      this.config.preferredTechnicalStack,
      this.config.userContext || undefined,
      context.currentStrategy || undefined,
    );

    await this.batchRunRepository.createBatchRun(
      batchId,
      jobs.map((j) => j.id!),
      jobsFetched,
      runId,
    );

    logger.info('Batch run recorded', { batchId, jobCount: jobs.length, runId });
  }

  async analyzeJobs(jobs: Job[], context: RunningAgentContext): Promise<JobAnalysis[]> {
    const analyses: JobAnalysis[] = [];
    for (const job of jobs) {
      try {
        let analysis: JobAnalysis;

        if (this.claudeAnalysisService) {
          const result = await this.claudeAnalysisService.analyzeJob(
            job,
            context.resume.redactedText,
            context.resume.metadata.yearsExperience ?? this.config.yearsExperience,
            this.config.preferredTechnicalStack,
            this.config.userContext || undefined,
            context.currentStrategy || undefined,
          );

          let coverLetterDraft: string | undefined;
          if (result.relevanceScore > 50) {
            try {
              const cl = await this.claudeAnalysisService.generateCoverLetter(
                job,
                result,
                context.resume.redactedText,
              );
              coverLetterDraft = [cl.opening, cl.body, cl.closing].join('\n\n');
            } catch (clErr) {
              logger.warn(`Cover letter generation failed for "${job.title}" — skipping`, {
                error: clErr instanceof Error ? clErr.message : String(clErr),
              });
            }
          }

          if (this.claudeAnalysisRepository && job.id) {
            await this.claudeAnalysisRepository.saveAnalysis(
              job.id,
              result,
              job.locationCategory ?? 'other',
              coverLetterDraft,
            );
          }

          analysis = {
            job_id: job.id ?? '',
            company: job.company,
            relevance_score: result.relevanceScore,
            interview_chance: result.interviewChance,
            location_category: job.locationCategory ?? 'other',
            overall_category: result.overallCategory,
            relevance_reasoning: result.relevanceReasoning,
            insights: result.insights,
            matched_patterns: result.matchedPatterns,
            cover_letter_draft: coverLetterDraft,
          };
        } else {
          analysis = await this.analyzeJob(job, context);
        }

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

    const userContextSection = this.config.userContext
      ? `\nUSER CONTEXT (explicit, highest priority):\n${this.config.userContext}\n`
      : '';
    const prompt = `You are an autonomous job search agent.
${userContextSection}
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
  "location_category": ${this.config.locationPriority.map((l) => `"${l}"`).join(' | ')},
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
      location_category: raw.location_category ?? job.locationCategory ?? 'other',
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

    // Fetch recent applied jobs — strongest learning signal (capped to avoid prompt bloat)
    const appRepo = new ApplicationRepository();
    const appliedJobs = await appRepo.getRecentApplications(30).catch(() => []);
    if (appliedJobs.length > 0) {
      logger.info(`Including ${appliedJobs.length} user-applied jobs as learning signal`);
    }

    if (this.claudeAnalysisService) {
      try {
        const learning = await this.claudeAnalysisService.learnPatterns(analyses, appliedJobs);
        logger.info('Pattern learning complete', {
          topSkills: learning.topSkillsMatched,
          focus: learning.recommendedFocus,
        });
        const successRate = analyses.filter((a) => a.overall_category !== 'skip').length / analyses.length;
        return learning.recommendedFocus.map((focus) => ({
          patternName: `focus_${focus.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
          patternType: 'tech_preference' as const,
          patternData: {
            topSkills: learning.topSkillsMatched,
            gaps: learning.commonGaps,
            categories: learning.bestJobCategories,
          },
          confidenceScore: Math.min(0.4 + successRate * 0.4, 0.8),
          observationCount: analyses.length,
        }));
      } catch (err) {
        logger.error('ClaudeAnalysisService.learnPatterns failed — falling back to default', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const highValueLines = analyses
      .filter((a) => a.relevance_score >= 75)
      .map((a) => `- ${a.company}: patterns=[${a.matched_patterns.join(', ')}] score=${a.relevance_score}`)
      .join('\n');

    const appliedLines = appliedJobs.length > 0
      ? appliedJobs.map((j) => `- ${j.title} at ${j.company}`).join('\n')
      : '- None yet';

    const prompt = `You analyzed ${analyses.length} jobs today.

USER-APPLIED JOBS (strongest signal — confirmed user intent):
${appliedLines}

HIGH-VALUE JOBS (relevance ≥ 75):
${highValueLines || '- None found today'}

ALL RESULTS SUMMARY:
- Auto-flagged: ${analyses.filter((a) => a.overall_category === 'auto-flag').length}
- Needs review: ${analyses.filter((a) => a.overall_category === 'needs-review').length}
- Skipped: ${analyses.filter((a) => a.overall_category === 'skip').length}

What patterns do you observe? Weight user-applied jobs most heavily.
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