import axios from 'axios';
import { Job, JobFetcher, SearchCriteria } from '../../types';
import { logger } from '../../utils/logger';

export class JSearchFetcher implements JobFetcher {
  constructor(private readonly apiKey: string) {}

  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    try {
      const query = criteria.jobTitles.join(' OR ');
      const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
        params: {
          query,
          num_pages: '1',
          date_posted: 'month',
          remote_jobs_only: 'false',
        },
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        timeout: 15000,
      });

      const jobs: Job[] = (response.data?.data ?? []).map(
        (raw: Record<string, unknown>) => ({
          source: 'jsearch',
          externalId: String(raw.job_id ?? ''),
          title: String(raw.job_title ?? ''),
          company: String(raw.employer_name ?? ''),
          description: String(raw.job_description ?? ''),
          location: `${raw.job_country ?? ''} - ${raw.job_state ?? ''}`.trim().replace(/^-\s*|-\s*$/, '').trim(),
          salaryMin: raw.job_min_salary != null ? Number(raw.job_min_salary) : undefined,
          salaryMax: raw.job_max_salary != null ? Number(raw.job_max_salary) : undefined,
          salaryCurrency: raw.salary_currency != null ? String(raw.salary_currency) : undefined,
          applyUrl: String(raw.job_apply_link ?? ''),
          postedAt: raw.job_posted_at_datetime_utc
            ? new Date(String(raw.job_posted_at_datetime_utc))
            : undefined,
          isActive: true,
        }),
      );

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
}