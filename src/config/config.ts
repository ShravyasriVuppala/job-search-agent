import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { Config } from '../types';

// Token budget for daily agent run:
// Resume: ~3K, Agent Memory: ~5K, Jobs: ~50K = 58K total
// Context window: 200K, Safety margin: 150K
// Proactive validation ensures we never exceed margin

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(key: string, defaultValue = ''): string {
  return process.env[key]?.trim() ?? defaultValue;
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function validateDatabaseUrl(url: string): void {
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must start with postgresql:// or postgres://');
  }
}

function validateClaudeApiKey(key: string): void {
  if (!key.startsWith('sk-ant-')) {
    throw new Error('CLAUDE_API_KEY must start with sk-ant-');
  }
}

function validateSendgridApiKey(key: string): void {
  if (!key.startsWith('SG.')) {
    throw new Error('SENDGRID_API_KEY must start with SG.');
  }
}

function validateEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`RECIPIENT_EMAIL is not a valid email address`);
  }
}

function validateResumePath(resumePath: string, base64: string): void {
  if (base64) return; // base64 provided, no need for file
  const resolved = path.resolve(process.cwd(), resumePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`RESUME_PATH file not found: ${resolved}`);
  }
}

export function validateAndLoadConfig(): Config {
  const databaseUrl = requireEnv('DATABASE_URL');
  const claudeApiKey = requireEnv('CLAUDE_API_KEY');
  const sendgridApiKey = requireEnv('SENDGRID_API_KEY');
  const recipientEmail = requireEnv('RECIPIENT_EMAIL');
  const resumePath = requireEnv('RESUME_PATH');
  const resumeBase64 = optionalEnv('RESUME_BASE64');

  const claudeModel = optionalEnv('CLAUDE_MODEL', 'claude-opus-4-7');
  const claudeMaxTokens = parseInt(optionalEnv('CLAUDE_MAX_TOKENS', '4096'), 10);
  if (isNaN(claudeMaxTokens) || claudeMaxTokens < 1 || claudeMaxTokens > 32_000) {
    throw new Error('CLAUDE_MAX_TOKENS must be an integer between 1 and 32000');
  }

  validateDatabaseUrl(databaseUrl);
  validateClaudeApiKey(claudeApiKey);
  validateSendgridApiKey(sendgridApiKey);
  validateEmail(recipientEmail);
  validateResumePath(resumePath, resumeBase64);

  const patternConfidenceThreshold = parseFloat(
    optionalEnv('PATTERN_CONFIDENCE_THRESHOLD', '0.5'),
  );
  if (
    isNaN(patternConfidenceThreshold) ||
    patternConfidenceThreshold < 0 ||
    patternConfidenceThreshold > 1
  ) {
    throw new Error('PATTERN_CONFIDENCE_THRESHOLD must be a number between 0 and 1');
  }

  const yearsExperience = parseInt(optionalEnv('YEARS_EXPERIENCE', '0'), 10);
  if (isNaN(yearsExperience) || yearsExperience < 0) {
    throw new Error('YEARS_EXPERIENCE must be a non-negative integer');
  }

  const agentMemoryRetentionDays = parseInt(
    optionalEnv('AGENT_MEMORY_RETENTION_DAYS', '90'),
    10,
  );
  if (isNaN(agentMemoryRetentionDays) || agentMemoryRetentionDays < 1) {
    throw new Error('AGENT_MEMORY_RETENTION_DAYS must be a positive integer');
  }

  const additionalPatternsRaw = optionalEnv('ADDITIONAL_REDACTION_PATTERNS', '');
  const additionalRedactionPatterns = additionalPatternsRaw
    ? parseCommaSeparated(additionalPatternsRaw)
    : [];

  return {
    databaseUrl,
    claudeApiKey,
    claudeModel,
    claudeMaxTokens,
    sendgridApiKey,
    recipientEmail,
    resumePath,
    resumeBase64: resumeBase64 || undefined,
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    jobTitles: parseCommaSeparated(
      optionalEnv('JOB_TITLES', 'Senior Software Engineer'),
    ),
    locationPriority: parseCommaSeparated(
      optionalEnv('LOCATION_PRIORITY', 'remote,washington,other'),
    ),
    locationKeywords: {
      remote: parseCommaSeparated(optionalEnv('LOCATION_KEYWORDS_REMOTE', 'remote')),
      washington: parseCommaSeparated(
        optionalEnv(
          'LOCATION_KEYWORDS_WASHINGTON',
          'seattle,bellevue,tacoma,redmond,renton,kirkland,sammamish,auburn,kent,des moines,washington,- wa',
        ),
      ),
      other: parseCommaSeparated(optionalEnv('LOCATION_KEYWORDS_OTHER', '')),
    },
    yearsExperience,
    preferredCompanyStage: parseCommaSeparated(
      optionalEnv('PREFERRED_COMPANY_STAGE', ''),
    ),
    excludeKeywords: parseCommaSeparated(optionalEnv('EXCLUDE_KEYWORDS', '')),
    preferredTechnicalStack: parseCommaSeparated(
      optionalEnv('PREFERRED_TECHNICAL_STACK', ''),
    ),
    jobFetchTime: optionalEnv('JOB_FETCH_TIME', '08:00'),
    jobFetchTimezone: optionalEnv('JOB_FETCH_TIMEZONE', 'America/Los_Angeles'),
    weeklyDigestDay: optionalEnv('WEEKLY_DIGEST_DAY', 'sunday'),
    weeklyDigestTime: optionalEnv('WEEKLY_DIGEST_TIME', '18:00'),
    weeklyDigestTimezone: optionalEnv(
      'WEEKLY_DIGEST_TIMEZONE',
      'America/Los_Angeles',
    ),
    enablePiiRedaction: optionalEnv('ENABLE_PII_REDACTION', 'true') !== 'false',
    additionalRedactionPatterns,
    agentMemoryRetentionDays,
    enablePatternLearning:
      optionalEnv('ENABLE_PATTERN_LEARNING', 'true') !== 'false',
    patternConfidenceThreshold,
    rapidApiKey: optionalEnv('RAPIDAPI_KEY'),
  };
}