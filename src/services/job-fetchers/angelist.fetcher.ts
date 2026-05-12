import axios from 'axios';
import { Job, JobFetcher, SearchCriteria } from '../../types';
import { logger } from '../../utils/logger';

// Wellfound (formerly AngelList) does not currently offer a public REST API.
// This fetcher gracefully returns [] when the endpoint is unavailable.
// The aggregator continues with the other 3 sources unaffected.
export class AngelListFetcher implements JobFetcher {
  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    try {
      const response = await axios.get('https://api.wellfound.com/jobs', {
        params: {
          keywords: criteria.jobTitles.join(','),
          remote_ok: 'true',
          limit: '50',
        },
        timeout: 15000,
      });

      const rawJobs: Record<string, unknown>[] = Array.isArray(response.data?.jobs)
        ? (response.data.jobs as Record<string, unknown>[])
        : Array.isArray(response.data)
          ? (response.data as Record<string, unknown>[])
          : [];

      const jobs: Job[] = rawJobs
        .filter((raw) => raw.url || raw.applyUrl)
        .map((raw) => ({
          source: 'angelist',
          externalId: String(raw.id ?? ''),
          title: String(raw.title ?? ''),
          company: String(raw.company ?? raw.startup ?? 'Unknown'),
          description: String(raw.description ?? ''),
          location: String(raw.location ?? 'Remote'),
          salaryMin: raw.salary_min != null ? Number(raw.salary_min) : undefined,
          salaryMax: raw.salary_max != null ? Number(raw.salary_max) : undefined,
          applyUrl: String(raw.url ?? raw.applyUrl ?? ''),
          postedAt: raw.created_at ? new Date(String(raw.created_at)) : undefined,
          isActive: true,
        }));

      logger.info(`AngelList: fetched ${jobs.length} jobs`);
      return jobs;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          logger.warn('AngelList: API requires authentication — public API not available, skipping');
        } else if (err.response?.status === 404) {
          logger.warn('AngelList: API endpoint not found — skipping');
        } else {
          logger.error('AngelList: fetch failed', {
            error: err.message,
          });
        }
      } else {
        logger.error('AngelList: fetch failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return [];
    }
  }
}