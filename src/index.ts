import { validateAndLoadConfig } from './config/config';
import { logger } from './utils/logger';
import { getPool, testConnection, closePool } from './db/client';
import { Server } from 'http';
import { createApp } from './app';
import { CoverLetterService } from './services/cover-letter.service';
import { ResumeService } from './services/resume.service';
import { ResumeChangeDetectionService } from './services/resume-change.service';
import { TokenBudgetService } from './services/token-budget.service';
import { ClaudeService } from './services/claude.service';
import { AutonomousAgent } from './services/agent.service';
import { JobAggregatorService } from './services/job-aggregator.service';
import { ClaudeAnalysisService } from './services/claude-analysis.service';
import { JSearchFetcher } from './services/job-fetchers/jsearch.fetcher';
import { loadJSearchConfig } from './config/jsearch.config';
// import { HackerNewsAlgoliaFetcher } from './services/job-fetchers/hackernews.fetcher';
// import { RemoteOKFetcher } from './services/job-fetchers/remoteok.fetcher';
// import { AngelListFetcher } from './services/job-fetchers/angelist.fetcher';
import { ResumeRepository } from './db/resume.repository';
import { AgentMemoryRepository } from './db/agent-memory.repository';
import { JobRepository } from './db/job.repository';
import { ClaudeAnalysisRepository } from './db/claude-analysis.repository';
import { agentContext } from './agent/context';

// Resume loaded once at startup, kept in agentContext.resume
// Reused across 40-50 job analyses without re-parsing.
// Cost savings: ~$0.03/day (parse once, use many times)

async function main(): Promise<void> {
  try {
    const config = validateAndLoadConfig();
    logger.info('Config validated', { nodeEnv: config.nodeEnv });

    getPool();
    await testConnection();
    logger.info('Database connected');

    const resumeService = new ResumeService();
    const resumeRepository = new ResumeRepository();
    const changeService = new ResumeChangeDetectionService(resumeRepository);

    const { redactedText, hash, metadata } = await resumeService.loadAndRedact(config.resumePath);

    const { changed, action } = await changeService.detectChange(hash, metadata);
    if (changed) {
      if (action === 'reset_memory') {
        await resumeRepository.resetAgentMemory();
      } else {
        await resumeRepository.decayPatternConfidence(0.8);
      }
      await resumeRepository.markAnalysisStale();
    }

    await resumeRepository.saveResumeMetadata({
      resume_hash: hash,
      resume_redacted: redactedText,
      years_experience: metadata.yearsExperience,
      technologies: metadata.technologies,
      companies: metadata.companies,
      education_level: metadata.educationLevel,
      certifications: metadata.certifications,
      soft_skills: metadata.softSkills,
    });

    agentContext.resume = { redactedText, hash, metadata };
    logger.info('Resume loaded and redacted');

    // Initialize agent services
    const agentMemoryRepository = new AgentMemoryRepository();
    const jobRepository = new JobRepository();
    const tokenBudget = new TokenBudgetService();
    const claudeService = new ClaudeService(config.claudeApiKey, config.claudeModel, config.claudeMaxTokens);
    const jobAggregator = new JobAggregatorService(
      [
        new JSearchFetcher(config.rapidApiKey, loadJSearchConfig()),
        // new HackerNewsAlgoliaFetcher(),
        // new RemoteOKFetcher(),
        // new AngelListFetcher(),
      ],
      jobRepository,
    );
    const claudeAnalysisService = new ClaudeAnalysisService(config.claudeApiKey, config.claudeModel);
    const claudeAnalysisRepository = new ClaudeAnalysisRepository();
    const agent = new AutonomousAgent(
      config,
      resumeRepository,
      agentMemoryRepository,
      claudeService,
      tokenBudget,
      jobAggregator,
      claudeAnalysisService,
      claudeAnalysisRepository,
      jobRepository,
    );

    // Expose agent for programmatic access (e.g. scheduler, tests)
    (global as Record<string, unknown>)['agent'] = agent;

    logger.info('Agent initialized and ready');

    // Phase 7 will add the scheduler that calls agent.runDailyLoop() at 8 AM PT.

    const coverLetterService = new CoverLetterService(claudeAnalysisService);
    const app = createApp(config.locationPriority, coverLetterService);
    const port = parseInt(process.env['PORT'] ?? '3001', 10);
    const server: Server = app.listen(port, () => {
      logger.info(`REST API listening on port ${port}`);
    });

    logger.info('System ready');

    async function shutdown(signal: string): Promise<void> {
      logger.info(`${signal} received — shutting down`);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closePool();
      process.exit(0);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Startup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();