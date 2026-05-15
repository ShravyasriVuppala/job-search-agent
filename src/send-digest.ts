import { validateAndLoadConfig } from './config/config';
import { testConnection } from './db/client';
import { DigestService } from './services/digest.service';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const config = validateAndLoadConfig();
  await testConnection();
  logger.info('DB connection verified — sending weekly digest');

  const digestService = new DigestService(
    config.mailgunApiKey,
    config.mailgunDomain,
    config.mailgunBaseUrl,
    config.recipientEmail,
  );

  await digestService.send();
}

main().catch((err) => {
  logger.error('Failed to send weekly digest', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
