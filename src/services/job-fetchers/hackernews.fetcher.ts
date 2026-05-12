import axios from 'axios';
import { Job, JobFetcher, SearchCriteria } from '../../types';
import { logger } from '../../utils/logger';

export class HackerNewsAlgoliaFetcher implements JobFetcher {
  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    try {
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 2592000;
      const response = await axios.get('https://hn.algolia.com/api/v1/search', {
        params: {
          query: `job ${criteria.jobTitles[0] ?? 'software engineer'}`,
          filters: 'type:job',
          numericFilters: `created_at_i>${thirtyDaysAgo}`,
          hitsPerPage: 50,
        },
        timeout: 15000,
      });

      const jobs: Job[] = (response.data?.hits ?? [])
        .filter(
          (raw: Record<string, unknown>) =>
            raw.url && typeof raw.url === 'string',
        )
        .map((raw: Record<string, unknown>) => ({
          source: 'hackernews',
          externalId: String(raw.objectID ?? ''),
          title: String(raw.title ?? ''),
          company: extractCompanyFromTitle(String(raw.title ?? '')),
          description: String(raw.text ?? ''),
          location: 'Remote',
          applyUrl: String(raw.url ?? ''),
          postedAt: raw.created_at ? new Date(String(raw.created_at)) : undefined,
          isActive: true,
        }));

      logger.info(`HackerNews: fetched ${jobs.length} jobs`);
      return jobs;
    } catch (err) {
      logger.error('HackerNews: fetch failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
}

// HN titles: "Company (YC S24) is hiring..." or "Company is hiring..."
function extractCompanyFromTitle(title: string): string {
  const match = title.match(/^([^(|]+?)(?:\s*\(|\s+is\s)/i);
  return match ? match[1].trim() : 'Unknown';
}