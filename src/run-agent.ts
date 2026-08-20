import { validateAndLoadConfig } from './config/config';
import { logger } from './utils/logger';
import { getPool, testConnection, closePool } from './db/client';
import { ResumeService } from './services/resume.service';
import { ResumeChangeDetectionService } from './services/resume-change.service';
import { TokenBudgetService } from './services/token-budget.service';
import { ClaudeService } from './services/claude.service';
import { AutonomousAgent } from './services/agent.service';
import { JobAggregatorService } from './services/job-aggregator.service';
import { ClaudeAnalysisService } from './services/claude-analysis.service';
import { JSearchFetcher } from './services/job-fetchers/jsearch.fetcher';
import { GreenhouseFetcher } from './services/job-fetchers/greenhouse.fetcher';
import { loadJSearchConfig } from './config/jsearch.config';
import { loadCompanies } from './config/companies.config';
import { ResumeRepository } from './db/resume.repository';
import { AgentMemoryRepository } from './db/agent-memory.repository';
import { JobRepository } from './db/job.repository';
import { ClaudeAnalysisRepository } from './db/claude-analysis.repository';
import { AgentRunRepository } from './db/agent-run.repository';
import { BatchRunRepository } from './db/batch-run.repository';
import { agentContext } from './agent/context';

async function main(): Promise<void> {
  logger.info('Agent run starting');

  const config = validateAndLoadConfig();
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
      logger.info('Major resume change — agent memory reset');
    } else {
      await resumeRepository.decayPatternConfidence(0.8);
      logger.info('Minor resume change — pattern confidence decayed');
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

  const agentMemoryRepository = new AgentMemoryRepository();
  const jobRepository = new JobRepository();
  const tokenBudget = new TokenBudgetService();
  const claudeService = new ClaudeService(config.claudeApiKey, config.claudeModel, config.claudeMaxTokens);
  const jobAggregator = new JobAggregatorService(
    [
      new JSearchFetcher(config.rapidApiKey, loadJSearchConfig()),
      new GreenhouseFetcher(loadCompanies()),
    ],
    jobRepository,
  );
  const claudeAnalysisService = new ClaudeAnalysisService(config.claudeApiKey, config.claudeModel);
  const claudeAnalysisRepository = new ClaudeAnalysisRepository();
  const agentRunRepository = new AgentRunRepository();
  const batchRunRepository = new BatchRunRepository();

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
    agentRunRepository,
    batchRunRepository,
  );

  await agent.runDailyLoop();
  logger.info('Agent run complete');
}

main()
  .catch((err) => {
    logger.error('Agent run failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  })
  .finally(() => closePool());
