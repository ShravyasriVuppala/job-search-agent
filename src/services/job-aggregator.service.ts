import { Job, JobFetcher, SearchCriteria } from '../types';
import { JobRepository } from '../db/job.repository';
import { logger } from '../utils/logger';

// If one API fails, continue with others.
// Wrapping each fetch in .catch() ensures:
// - JSearch down? HN + RemoteOK + AngelList still work
// - Fetch returns 47 jobs instead of 50
// - Agent continues with what it has (production-grade reliability)

export class JobAggregatorService {
  constructor(
    private readonly fetchers: JobFetcher[],
    private readonly jobRepository: JobRepository,
  ) {}

  async fetchAndStoreJobs(criteria: SearchCriteria): Promise<Job[]> {
    const results = await Promise.all(
      this.fetchers.map((fetcher) =>
        fetcher.fetch(criteria).catch((err: unknown) => {
          logger.error('Fetcher error (caught at aggregator level)', {
            error: err instanceof Error ? err.message : String(err),
          });
          return [] as Job[];
        }),
      ),
    );

    const allJobs = results.flat();
    logger.info(`Fetched ${allJobs.length} jobs from ${this.fetchers.length} sources`);

    // apply_url is the unique key. Same job posted on multiple platforms
    // should appear once in DB (Map key ensures uniqueness).
    // Cost savings: Don't analyze the same job multiple times.
    const deduped = new Map<string, Job>();
    for (const job of allJobs) {
      if (job.applyUrl && !deduped.has(job.applyUrl)) {
        deduped.set(job.applyUrl, job);
      }
    }
    const uniqueJobs = Array.from(deduped.values());
    logger.info(`Deduped: ${allJobs.length} jobs → ${uniqueJobs.length} unique`);

    // Simple regex categorization (Phase 4).
    // Phase 5: Claude refines location categorization using full job context.
    // For now: 'remote', 'washington', 'other' good enough.
    for (const job of uniqueJobs) {
      job.locationCategory = this.categorizeLocation(job.location);
    }

    // Jobs fetched fresh daily (8 AM).
    // ~50K tokens in context window per run.
    // If we cached old jobs: context bloats, costs increase.
    // Fresh jobs = clean, bounded context.
    await this.jobRepository.saveJobs(uniqueJobs);
    logger.info(`Stored ${uniqueJobs.length} jobs in DB`);

    return uniqueJobs;
  }

  categorizeLocation(location?: string): string {
    if (!location) return 'other';
    const l = location.toLowerCase();
    if (l.includes('remote')) return 'remote';
    if (
      l.includes('washington') ||
      l.includes('seattle') ||
      l.includes('bellevue') ||
      l.includes('redmond') ||
      l.includes(', wa') ||
      l.includes(' wa ')
    )
      return 'washington';
    return 'other';
  }
}