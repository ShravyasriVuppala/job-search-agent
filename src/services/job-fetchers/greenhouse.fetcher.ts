import axios from 'axios';
import { Job, JobFetcher, SearchCriteria } from '../../types';
import { Company } from '../../config/companies.config';
import { logger } from '../../utils/logger';

const ENGINEERING_KEYWORDS = ['engineer', 'developer', 'software', 'programmer', 'architect'];

// Coarse scope filter for an ATS board, which lists every department (eng, sales, recruiting, …).
// Keeps engineering-shaped roles plus anything matching a configured title phrase; Claude does the
// fine-grained relevance scoring afterward. This is source scoping, not a ranking/triage stage.
export function titleMatches(title: string, jobTitles: string[]): boolean {
  const t = title.toLowerCase();
  if (ENGINEERING_KEYWORDS.some((k) => t.includes(k))) return true;
  if (/\b(sde|swe)\b/.test(t)) return true;
  return jobTitles.some((jt) => {
    const q = jt.trim().toLowerCase();
    return q.length > 0 && t.includes(q);
  });
}

// Greenhouse returns `content` as HTML with its angle brackets entity-escaped. Decode one layer,
// strip tags, and normalize whitespace so the analysis prompt gets readable text.
export function htmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ') // list items → bulleted lines
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|section|header)\s*>/gi, '\n') // block ends → newline
    .replace(/<[^>]+>/g, ' ') // strip remaining tags
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#39;|&#8217;|&#8216;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ') // collapse spaces/tabs but keep newlines
    .replace(/ *\n */g, '\n') // trim spaces around newlines
    .replace(/\n{3,}/g, '\n\n') // cap consecutive blank lines
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GreenhouseFetcher implements JobFetcher {
  constructor(
    private readonly companies: Company[],
    private readonly delayMs = 300,
  ) {}

  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    const boards = this.companies.filter((c) => c.provider === 'greenhouse' && c.slug.trim());
    if (boards.length === 0) {
      logger.info('Greenhouse: no companies configured — skipping');
      return [];
    }

    const all: Job[] = [];
    for (let i = 0; i < boards.length; i++) {
      all.push(...(await this.fetchBoard(boards[i], criteria)));
      // Polite per-host delay between boards (all hit boards-api.greenhouse.io).
      if (i < boards.length - 1 && this.delayMs > 0) await sleep(this.delayMs);
    }

    logger.info('Greenhouse fetch complete', { boards: boards.length, jobs: all.length });
    return all;
  }

  private async fetchBoard(company: Company, criteria: SearchCriteria): Promise<Job[]> {
    try {
      const response = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`,
        { params: { content: 'true' }, timeout: 20000 },
      );

      const rawJobs: Record<string, unknown>[] = Array.isArray(response.data?.jobs)
        ? (response.data.jobs as Record<string, unknown>[])
        : [];
      const jobs = rawJobs
        .filter((raw) => titleMatches(String(raw.title ?? ''), criteria.jobTitles))
        .map((raw) => this.mapJob(raw, company));

      logger.info(`Greenhouse: ${company.name} → ${jobs.length} relevant of ${rawJobs.length} roles`);
      return jobs;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 404) {
        logger.warn(`Greenhouse: board not found for "${company.name}" (slug: ${company.slug}) — skipping`);
      } else {
        logger.error(`Greenhouse: fetch failed for "${company.name}"`, {
          slug: company.slug,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return []; // never abort the run over one bad board
    }
  }

  private mapJob(raw: Record<string, unknown>, company: Company): Job {
    const location = (raw.location as { name?: string } | undefined)?.name;
    return {
      source: 'greenhouse',
      externalId: String(raw.id ?? ''),
      title: String(raw.title ?? ''),
      company: company.name, // the board is per-company; Greenhouse jobs don't carry the name
      description: htmlToText(String(raw.content ?? '')),
      location: location ?? undefined,
      // locationCategory left unset — the aggregator buckets it before dedup.
      applyUrl: String(raw.absolute_url ?? ''),
      postedAt: raw.updated_at ? new Date(String(raw.updated_at)) : undefined,
      isActive: true,
    };
  }
}
