import { validateAndLoadConfig } from './config/config';
import { logger } from './utils/logger';
import { getPool, testConnection, closePool } from './db/client';
import { Server } from 'http';
import { createApp } from './app';
import { CoverLetterService } from './services/cover-letter.service';
import { ClaudeAnalysisService } from './services/claude-analysis.service';

// This is the REST API server for the dashboard — it only needs Claude access for on-demand
// cover letter generation (see CoverLetterService, which reads the résumé/memory/analysis it
// needs from the DB itself). Fetching, analysis, and the daily agent loop live in run-agent.ts;
// don't duplicate that setup here.

async function main(): Promise<void> {
  try {
    const config = validateAndLoadConfig();
    logger.info('Config validated', { nodeEnv: config.nodeEnv });

    getPool();
    await testConnection();
    logger.info('Database connected');

    const claudeAnalysisService = new ClaudeAnalysisService(config.claudeApiKey, config.claudeModel, config.analysisDescMaxChars);
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
