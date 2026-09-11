import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

// JSearch fetch strategy — kept out of code so cadence, the location matrix, the recency window,
// and the quota guard can be tuned without a deploy. See config/jsearch.json.
export interface JSearchConfig {
  // Weekdays JSearch is allowed to run on (short lowercase names: sun,mon,tue,wed,thu,fri,sat).
  // JSearch is the periodic sweep; on off-days the fetcher self-skips so the daily lane
  // (Greenhouse) still runs.
  cadence: string[];
  // JSearch date_posted window (e.g. '3days' | 'week'), matched to the cadence so we stop
  // re-fetching the same postings every run.
  datePosted: string;
  // Hard ceiling on requests issued in one run (the JSearch monthly quota is small).
  maxRequestsPerRun: number;
  // Stop issuing queries once x-ratelimit-requests-remaining drops below this.
  minReserve: number;
  // Location search terms (e.g. 'remote', 'Seattle, WA', 'US'). Distinct from LOCATION_PRIORITY,
  // which is the analysis-side bucketing.
  locations: string[];
}

const DEFAULTS: JSearchConfig = {
  cadence: ['mon', 'wed', 'fri'],
  datePosted: 'week',
  maxRequestsPerRun: 15,
  minReserve: 20,
  locations: ['remote', 'Seattle, WA', 'US'],
};

export function loadJSearchConfig(): JSearchConfig {
  const file = path.resolve(process.cwd(), 'config/jsearch.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<JSearchConfig>;
    // Validate per field so a single wrong type can't crash the fetch loop — fall back to the
    // default for any field that's missing or malformed.
    return {
      cadence: isStringArray(parsed.cadence) ? parsed.cadence : DEFAULTS.cadence,
      datePosted: typeof parsed.datePosted === 'string' ? parsed.datePosted : DEFAULTS.datePosted,
      maxRequestsPerRun: isPositiveNumber(parsed.maxRequestsPerRun) ? parsed.maxRequestsPerRun : DEFAULTS.maxRequestsPerRun,
      minReserve: isPositiveNumber(parsed.minReserve) ? parsed.minReserve : DEFAULTS.minReserve,
      locations: isStringArray(parsed.locations) ? parsed.locations : DEFAULTS.locations,
    };
  } catch {
    logger.warn('config/jsearch.json missing or invalid — using built-in JSearch defaults');
    return DEFAULTS;
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}
