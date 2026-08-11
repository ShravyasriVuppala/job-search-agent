import { Job, JobFetcher, LocationKeywords, SearchCriteria } from '../types';
import { JobRepository } from '../db/job.repository';
import { logger } from '../utils/logger';

// If one API fails, continue with others.
// Wrapping each fetch in .catch() ensures:
// - JSearch down? Greenhouse + others still work
// - Fetch returns 47 jobs instead of 50
// - Agent continues with what it has (production-grade reliability)

// Aggregators (job boards) return truncated descriptions and append tracking params to apply
// URLs. ATS / direct-employer sources (Greenhouse, Lever, Ashby, Workday, ...) return the full
// posting. On a dedup collision we keep the richer record — see preferredRecord().
const AGGREGATOR_SOURCES = new Set(['jsearch', 'hackernews', 'remoteok', 'angellist']);

function sourceRank(source: string): number {
  // Higher = preferred. ATS / direct sources outrank aggregators.
  return AGGREGATOR_SOURCES.has(source) ? 0 : 1;
}

// Normalize a field for the dedup key: lowercase, punctuation → spaces, collapse whitespace.
function norm(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The same role on a company ATS and on a job board has two different apply URLs, so a URL can't
// be the dedup key. company | title | location-bucket identifies the underlying role.
function dedupKey(job: Job): string {
  return `${norm(job.company)}|${norm(job.title)}|${norm(job.locationCategory)}`;
}

// Strip the query string and fragment so tracking params (utm_*, gh_src, ref, ...) don't make the
// same posting look like distinct URLs to the storage-level uniqueness checks.
function canonicalUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

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

    // Location bucket and canonical apply URL both feed dedup, so compute them before deduping.
    for (const job of allJobs) {
      if (!job.locationCategory) {
        job.locationCategory = this.categorizeLocation(job.location, criteria.locationKeywords);
      }
      if (job.applyUrl) {
        job.applyUrl = canonicalUrl(job.applyUrl);
      }
    }

    // Dedup on company | title | location-bucket. On collision, keep the richer record
    // (ATS source over aggregator; fuller description as the tiebreak). Cost savings: the same
    // role seen on multiple sources is analyzed once, and we keep the best copy of it.
    const deduped = new Map<string, Job>();
    for (const job of allJobs) {
      const key = dedupKey(job);
      const existing = deduped.get(key);
      deduped.set(key, existing ? this.preferredRecord(existing, job) : job);
    }
    const uniqueJobs = Array.from(deduped.values());
    logger.info(`Deduped: ${allJobs.length} jobs → ${uniqueJobs.length} unique`);

    // Storage-level uniqueness is enforced by the (source, external_id) constraint in saveJobs.
    await this.jobRepository.saveJobs(uniqueJobs);
    logger.info(`Stored ${uniqueJobs.length} jobs in DB`);

    return uniqueJobs;
  }

  // Collision resolution: prefer an ATS/direct source over an aggregator (fuller description);
  // when both are the same tier, prefer whichever description is longer.
  private preferredRecord(a: Job, b: Job): Job {
    const ra = sourceRank(a.source);
    const rb = sourceRank(b.source);
    if (ra !== rb) return ra > rb ? a : b;
    return (a.description?.length ?? 0) >= (b.description?.length ?? 0) ? a : b;
  }

  categorizeLocation(location?: string, locationKeywords?: LocationKeywords): string {
    if (!location) return 'other';
    const loc = location.toLowerCase();
    const kw: LocationKeywords = locationKeywords ?? {
      remote: ['remote'],
      washington: ['washington', 'seattle', '- wa'],
      other: [],
    };
    if (kw.remote.some((k) => loc.includes(k))) return 'remote';
    if (kw.washington.some((k) => loc.includes(k))) return 'washington';
    if (kw.other.length > 0 && kw.other.some((k) => loc.includes(k))) return 'other';
    return 'other';
  }
}
