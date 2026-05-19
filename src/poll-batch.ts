import { validateAndLoadConfig } from './config/config';
import { testConnection, closePool } from './db/client';
import { BatchRunRepository, BatchRun } from './db/batch-run.repository';
import { JobRepository } from './db/job.repository';
import { ClaudeAnalysisRepository } from './db/claude-analysis.repository';
import { AgentMemoryRepository } from './db/agent-memory.repository';
import { AgentRunRepository } from './db/agent-run.repository';
import { ApplicationRepository } from './db/application.repository';
import { ResumeRepository } from './db/resume.repository';
import { ClaudeAnalysisService } from './services/claude-analysis.service';
import { JobAnalysis } from './types';
import { logger } from './utils/logger';

async function processBatch(
  batchRun: BatchRun,
  claudeAnalysisService: ClaudeAnalysisService,
  jobRepository: JobRepository,
  claudeAnalysisRepository: ClaudeAnalysisRepository,
  agentMemoryRepository: AgentMemoryRepository,
  agentRunRepository: AgentRunRepository,
  batchRunRepository: BatchRunRepository,
  appRepository: ApplicationRepository,
  resumeRedactedText: string,
): Promise<void> {
  // 1. Check if Anthropic has finished processing
  const status = await claudeAnalysisService.checkBatchStatus(batchRun.batchId);
  if (status !== 'ended') {
    logger.info(`Batch still in progress — skipping`, { batchId: batchRun.batchId });
    return;
  }

  logger.info(`Batch complete — processing results`, { batchId: batchRun.batchId });

  // 2. Fetch job records to get location_category and company name
  const jobs = await jobRepository.getJobsByIds(batchRun.jobIds);
  const jobMap = new Map(jobs.map((j) => [j.id!, j]));

  // 3. Parse results from Anthropic and save analyses to DB in parallel
  const resultMap = await claudeAnalysisService.processBatchResults(batchRun.batchId);

  const saveResults = await Promise.all(
    Array.from(resultMap.entries()).map(async ([jobId, { analysis }]): Promise<JobAnalysis | null> => {
      const job = jobMap.get(jobId);
      if (!job) {
        logger.warn(`Job ${jobId} not found in DB — skipping analysis save`);
        return null;
      }

      // Generate cover letter for relevant jobs — same threshold and prompt as sequential path
      let coverLetterDraft: string | undefined;
      if (analysis.relevanceScore > 50) {
        try {
          const cl = await claudeAnalysisService.generateCoverLetter(job, analysis, resumeRedactedText);
          coverLetterDraft = [cl.opening, cl.body, cl.closing].join('\n\n');
        } catch (clErr) {
          logger.warn(`Cover letter generation failed for "${job.title}" — skipping`, {
            error: clErr instanceof Error ? clErr.message : String(clErr),
          });
        }
      }

      try {
        await claudeAnalysisRepository.saveAnalysis(
          jobId,
          analysis,
          job.locationCategory ?? 'other',
          coverLetterDraft,
        );
      } catch (err) {
        logger.error(`Failed to save analysis for job ${jobId} — skipping`, {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }

      return {
        job_id: jobId,
        company: job.company,
        relevance_score: analysis.relevanceScore,
        interview_chance: analysis.interviewChance,
        location_category: job.locationCategory ?? 'other',
        overall_category: analysis.overallCategory,
        relevance_reasoning: analysis.relevanceReasoning,
        insights: analysis.insights,
        matched_patterns: analysis.matchedPatterns,
        cover_letter_draft: coverLetterDraft,
      };
    }),
  );

  const analyses = saveResults.filter((r): r is JobAnalysis => r !== null);
  logger.info(`Saved ${analyses.length}/${resultMap.size} analyses to DB`);

  // 4. Learn patterns from the batch results (single Claude call)
  let patternsUpserted = 0;
  if (analyses.length > 0) {
    const appliedJobs = await appRepository.getRecentApplications(30).catch(() => []);

    try {
      const learning = await claudeAnalysisService.learnPatterns(analyses, appliedJobs);
      const successRate = analyses.filter((a) => a.overall_category !== 'skip').length / analyses.length;
      const patterns = learning.recommendedFocus.map((focus) => ({
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

      await agentMemoryRepository.upsertAll(patterns);
      patternsUpserted = patterns.length;
      logger.info(`Pattern learning complete`, { patterns: patternsUpserted });
    } catch (err) {
      logger.warn('Pattern learning failed — skipping', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5. Complete the agent run with final metrics
  if (batchRun.runId) {
    const tokenUsage = claudeAnalysisService.getTokenUsage();
    await agentRunRepository.completeRun(batchRun.runId, {
      jobsFetched: batchRun.jobsFetched,
      jobsAnalyzed: analyses.length,
      autoFlagged: analyses.filter((a) => a.overall_category === 'auto-flag').length,
      maybeFlagged: analyses.filter((a) => a.overall_category === 'maybe-flag').length,
      skipped: analyses.filter((a) => a.overall_category === 'skip').length,
      patternsUpserted,
      tokensInput: tokenUsage.input,
      tokensOutput: tokenUsage.output,
    });
    logger.info('Agent run completed', {
      runId: batchRun.runId,
      cacheCreationTokens: tokenUsage.cacheCreation,
      cacheReadTokens: tokenUsage.cacheRead,
    });
  }

  // 6. Mark batch as done
  await batchRunRepository.completeBatch(batchRun.id);
}

async function main(): Promise<void> {
  const config = validateAndLoadConfig();
  await testConnection();

  const batchRunRepository = new BatchRunRepository();

  // Auto-fail batches that have been pending beyond Anthropic's 24h expiry window
  await batchRunRepository.failStaleBatches();

  const pending = await batchRunRepository.getPendingBatches();

  if (pending.length === 0) {
    logger.info('No pending batches — exiting');
    return;
  }

  logger.info(`Found ${pending.length} pending batch(es)`);

  const resumeRepository = new ResumeRepository();
  const resumeMeta = await resumeRepository.getResumeMetadata();
  if (!resumeMeta) {
    logger.error('No resume found in DB — cannot generate cover letters. Aborting.');
    return;
  }

  const claudeAnalysisService = new ClaudeAnalysisService(config.claudeApiKey, config.claudeModel);
  const jobRepository = new JobRepository();
  const claudeAnalysisRepository = new ClaudeAnalysisRepository();
  const agentMemoryRepository = new AgentMemoryRepository();
  const agentRunRepository = new AgentRunRepository();
  const appRepository = new ApplicationRepository();

  for (const batchRun of pending) {
    claudeAnalysisService.resetTokenUsage();
    try {
      await processBatch(
        batchRun,
        claudeAnalysisService,
        jobRepository,
        claudeAnalysisRepository,
        agentMemoryRepository,
        agentRunRepository,
        batchRunRepository,
        appRepository,
        resumeMeta.resumeRedacted,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to process batch ${batchRun.batchId}`, { error: message });
      await batchRunRepository.failBatch(batchRun.id, message);
      if (batchRun.runId) {
        await agentRunRepository.failRun(batchRun.runId, `Batch processing failed: ${message}`);
      }
    }
  }
}

main()
  .catch((err) => {
    logger.error('Poll-batch failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  })
  .finally(() => closePool());
