import axios from 'axios';
import { Job, JobFetcher, LocationKeywords, SearchCriteria } from '../../types';
import { JSearchConfig } from '../../config/jsearch.config';
import { logger } from '../../utils/logger';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Cap a term list to `max` effective terms: keep the first `max - 1` distinct, then OR the
// remainder into one combined term. Bounds the query matrix regardless of how many titles or
// locations are configured. e.g. capTerms([A,B,C,D,E], 4) -> [A, B, C, "D OR E"].
export function capTerms(terms: string[], max: number): string[] {
  const cleaned = terms.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length <= max) return cleaned;
  return [...cleaned.slice(0, max - 1), cleaned.slice(max - 1).join(' OR ')];
}

export class JSearchFetcher implements JobFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly config: JSearchConfig,
  ) {}

  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    if (!this.isScheduledToday()) {
      logger.info(`JSearch: not scheduled today (cadence: ${this.config.cadence.join(',')}) — skipping`);
      return [];
    }

    // Query matrix: capped titles × capped locations, one num_pages=1 request each.
    const titles = capTerms(criteria.jobTitles, 4);
    const locations = capTerms(this.config.locations, 3);
    const matrix = titles.flatMap((title) => locations.map((location) => ({ title, location })));

    if (matrix.length === 0) {
      logger.warn('JSearch: empty query matrix (no job titles or no locations configured) — skipping');
      return [];
    }

    const raw: Job[] = [];
    let issued = 0;
    let remaining = Infinity;

    for (const { title, location } of matrix.slice(0, this.config.maxRequestsPerRun)) {
      if (remaining < this.config.minReserve) {
        logger.warn(`JSearch: quota low (${remaining} remaining) — skipping remaining queries`);
        break;
      }
      const result = await this.fetchOne(title, location, criteria);
      raw.push(...result.jobs);
      issued++;
      if (result.remaining !== undefined) remaining = result.remaining;
    }

    const valid = raw.filter((j) => j.externalId && j.applyUrl);
    logger.info('JSearch fetch complete', {
      queriesIssued: issued,
      rawPostings: valid.length,
      requestsRemaining: remaining === Infinity ? 'unknown' : remaining,
    });
    return valid;
  }

  private isScheduledToday(): boolean {
    const today = DAY_NAMES[new Date().getDay()];
    // Match on the 3-letter prefix so "mon", "Mon", and "monday" all work.
    return this.config.cadence.some((d) => d.trim().toLowerCase().slice(0, 3) === today);
  }

  // One JSearch request. Returns the parsed jobs and the remaining monthly quota (from the
  // response header) so the caller can stop before exhausting it.
  private async fetchOne(
    title: string,
    location: string,
    criteria: SearchCriteria,
  ): Promise<{ jobs: Job[]; remaining?: number }> {
    try {
      const response = await axios.get('https://jsearch.p.rapidapi.com/search-v2', {
        params: {
          query: `${title} ${location}`.trim(),
          job_title: title,
          num_pages: '1',
          date_posted: this.config.datePosted,
          country: 'us',
        },
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        timeout: 45000,
      });

      const header = response.headers?.['x-ratelimit-requests-remaining'];
      const remaining = header !== undefined ? Number(header) : undefined;
      return { jobs: this.parseJobs(response.data, criteria), remaining };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        // Out of quota — signal the loop to stop rather than keep hammering.
        logger.warn('JSearch: rate limit reached (429) — stopping');
        return { jobs: [], remaining: 0 };
      }
      logger.error('JSearch: query failed', {
        query: `${title} ${location}`,
        error: err instanceof Error ? err.message : String(err),
      });
      return { jobs: [] };
    }
  }

  private parseJobs(data: unknown, criteria: SearchCriteria): Job[] {
    // API returns data.data as an array (v1) or data.data.jobs as an array (v2)
    const payload = (data as { data?: unknown })?.data;
    const rawData: Record<string, unknown>[] = Array.isArray(payload)
      ? (payload as Record<string, unknown>[])
      : Array.isArray((payload as Record<string, unknown>)?.jobs)
        ? ((payload as Record<string, unknown>).jobs as Record<string, unknown>[])
        : [];

    return rawData.map((raw) => {
      const location = `${raw.job_country ?? ''} - ${raw.job_state ?? ''}`
        .trim()
        .replace(/^-\s*|-\s*$/, '')
        .trim();
      return {
        source: 'jsearch',
        externalId: String(raw.job_id ?? ''),
        title: String(raw.job_title ?? ''),
        company: String(raw.employer_name ?? ''),
        description: String(raw.job_description ?? ''),
        location,
        locationCategory: this.categorizeLocation(location, String(raw.job_title ?? ''), raw.job_is_remote === true, criteria.locationKeywords),
        salaryMin: raw.job_min_salary != null ? Number(raw.job_min_salary) : undefined,
        salaryMax: raw.job_max_salary != null ? Number(raw.job_max_salary) : undefined,
        salaryCurrency: raw.salary_currency != null ? String(raw.salary_currency) : undefined,
        applyUrl: String(raw.job_apply_link ?? ''),
        postedAt: raw.job_posted_at_datetime_utc
          ? new Date(String(raw.job_posted_at_datetime_utc))
          : undefined,
        isActive: true,
        recruiterName: raw.recruiter_name ? String(raw.recruiter_name) : undefined,
        recruiterEmail: raw.recruiter_email ? String(raw.recruiter_email) : undefined,
        companyHiringUrl: raw.company_hiring_url ? String(raw.company_hiring_url) : undefined,
        companySize: raw.company_size ? String(raw.company_size) : undefined,
        companyWebsite: raw.company_website ? String(raw.company_website) : undefined,
      };
    });
  }

  private categorizeLocation(location: string | undefined, title: string, isRemoteFlag: boolean, locationKeywords?: LocationKeywords): string {
    const loc = (location ?? '').toLowerCase();
    const kw: LocationKeywords = locationKeywords ?? {
      remote: ['remote'],
      washington: ['washington', 'seattle', '- wa'],
      other: [],
    };
    // Remote is a work arrangement, not a place — check location, title, and the API's is_remote flag
    const remoteTarget = `${loc} ${title.toLowerCase()}`;
    if (isRemoteFlag || kw.remote.some((k) => remoteTarget.includes(k))) return 'remote';
    // Washington/other are geographic — only check location string
    if (kw.washington.some((k) => loc.includes(k))) return 'washington';
    if (kw.other.length > 0 && kw.other.some((k) => loc.includes(k))) return 'other';
    return 'other';
  }
}
