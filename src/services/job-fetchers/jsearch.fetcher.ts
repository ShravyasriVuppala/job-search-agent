import axios from 'axios';
import { Job, JobFetcher, LocationKeywords, SearchCriteria } from '../../types';
import { logger } from '../../utils/logger';

export class JSearchFetcher implements JobFetcher {
  constructor(private readonly apiKey: string) {}

  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    try {
      const response = await axios.get('https://jsearch.p.rapidapi.com/search-v2', {
        params: {
          query: criteria.jobTitles.join(' OR '),
          num_pages: '5',
          date_posted: 'month',
          job_title: criteria.jobTitles.join(','),
          country: 'us',
        },
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        timeout: 15000,
      });

      // API returns data.data as an array (v1) or data.data.jobs as an array (v2)
      const payload = response.data?.data;
      const rawData: Record<string, unknown>[] = Array.isArray(payload)
        ? (payload as Record<string, unknown>[])
        : Array.isArray((payload as Record<string, unknown>)?.jobs)
          ? ((payload as Record<string, unknown>).jobs as Record<string, unknown>[])
          : [];
      const jobs: Job[] = rawData.map((raw) => {
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
          locationCategory: this.categorizeLocation(location, criteria.locationKeywords),
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

      const valid = jobs.filter((j) => j.externalId && j.applyUrl);
      logger.info(`JSearch: fetched ${valid.length} jobs`);
      return valid;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        logger.warn('JSearch: rate limit reached (429) — skipping');
      } else {
        logger.error('JSearch: fetch failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return [];
    }
  }

  private categorizeLocation(location: string | undefined, locationKeywords?: LocationKeywords): string {
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
