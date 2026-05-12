import { validateAndLoadConfig } from './config/config';
import { logger } from './utils/logger';
import { getPool, testConnection, closePool } from './db/client';
import { ResumeService } from './services/resume.service';
import { ResumeChangeDetectionService } from './services/resume-change.service';
import { ResumeRepository } from './db/resume.repository';
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

    logger.info('System ready');
  } catch (error) {
    logger.error('Startup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down');
  await closePool();
  process.exit(0);
});

main();