import axios from 'axios';
import { Job, JobFetcher, SearchCriteria } from '../../types';
import { logger } from '../../utils/logger';

type RemoteOKRaw = {
  id?: string | number;
  slug?: string;
  epoch?: number;
  title?: string;
  company?: string;
  description?: string;
  url?: string;
  tags?: string[];
  salary_min?: number;
  salary_max?: number;
  legal?: string;
};

export class RemoteOKFetcher implements JobFetcher {
  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    try {
      const response = await axios.get<RemoteOKRaw[]>('https://remoteok.com/api', {
        headers: { 'User-Agent': 'job-search-agent/1.0' },
        timeout: 15000,
      });

      const lowerStack = criteria.preferredStack.map((s) => s.toLowerCase());

      const jobs: Job[] = (response.data ?? [])
        .slice(1) // first element is a metadata/legal object, not a job
        .filter((raw) => raw.url && raw.title)
        .filter((raw) => {
          // skip if salary is posted and suspiciously low (< $50k)
          if (raw.salary_max != null && raw.salary_max < 50000) return false;
          return true;
        })
        .filter((raw) => {
          if (lowerStack.length === 0) return true;
          const tags = (raw.tags ?? []).map((t) => t.toLowerCase());
          const desc = (raw.description ?? '').toLowerCase();
          return lowerStack.some((tech) => tags.includes(tech) || desc.includes(tech));
        })
        .map((raw) => ({
          source: 'remoteok',
          externalId: String(raw.id ?? raw.slug ?? ''),
          title: String(raw.title ?? ''),
          company: String(raw.company ?? 'Unknown'),
          description: String(raw.description ?? ''),
          location: 'Remote',
          salaryMin: raw.salary_min,
          salaryMax: raw.salary_max,
          applyUrl: String(raw.url ?? ''),
          postedAt: raw.epoch ? new Date(raw.epoch * 1000) : undefined,
          isActive: true,
        }));

      logger.info(`RemoteOK: fetched ${jobs.length} jobs`);
      return jobs;
    } catch (err) {
      logger.error('RemoteOK: fetch failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
}