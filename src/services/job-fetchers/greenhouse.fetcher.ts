import axios from 'axios';
import { Job, JobFetcher, SearchCriteria } from '../../types';
import { Company } from '../../config/companies.config';
import { logger } from '../../utils/logger';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const ENGINEERING_KEYWORDS = ['engineer', 'developer', 'software', 'programmer', 'architect'];

// Roles that pass the "engineer" keyword but aren't the target IC backend/AI profile. Filtered out
// at the source so an ATS board's whole-department listing doesn't spend the analysis budget on
// jobs that would only be skipped. (Infra/platform/security/data/ML are intentionally NOT excluded
// — Claude scores those on merit.)
const EXCLUDE_TITLE: RegExp[] = [
  /front[\s-]?end/, // frontend / front-end / front end
  /\b(mobile|ios|android)\b/,
  /\bmanager\b|\bmanagement\b/, // ICs only
  /\b(intern|apprentice|associate|junior)\b/, // junior levels
  /\b(engineer|swe|sde)\s+(ii|i|1|2)\b/, // Software Engineer I/II, etc.
  /\b(field|solutions?|sales)\s+engineer\b/, // sales/field-adjacent ("forward deployed" is a target title, not excluded)
];

// Coarse scope filter for an ATS board, which lists every department (eng, sales, recruiting, …).
// Keeps engineering-shaped roles plus anything matching a configured title phrase, minus the
// non-target roles above; Claude does the fine-grained relevance scoring afterward.
export function titleMatches(title: string, jobTitles: string[]): boolean {
  const t = title.toLowerCase();
  if (EXCLUDE_TITLE.some((re) => re.test(t))) return false;
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

// US-only. JSearch is already country-scoped; Greenhouse boards list every geo, so filter here.
// A US state abbreviation must follow a comma ("Bellevue, WA") to avoid matching words like "or".
const US_STATE = /,\s*(a[klrz]|c[aot]|d[ce]|fl|ga|hi|i[adln]|k[sy]|la|m[adeinost]|n[cdehjmvy]|o[hkr]|pa|ri|s[cd]|t[nx]|ut|v[at]|w[aivy])\b/i;
const US_SIGNAL = /\b(united states|u\.?s\.?a\.?|usa|remote[\s-]*us(a)?)\b/i;
const NON_US =
  /\b(canada|ontario|british columbia|quebec|alberta|toronto|vancouver|montreal|ottawa|calgary|united kingdom|\buk\b|england|scotland|wales|ireland|dublin|london|manchester|india|bangalore|bengaluru|mumbai|hyderabad|pune|delhi|chennai|noida|gurgaon|poland|warsaw|germany|berlin|munich|france|paris|spain|madrid|barcelona|italy|netherlands|amsterdam|portugal|lisbon|romania|bucharest|israel|tel aviv|singapore|australia|sydney|melbourne|japan|tokyo|china|shanghai|beijing|hong kong|korea|seoul|brazil|mexico|argentina|colombia|qatar|doha|dubai|abu dhabi|\buae\b|saudi|emea|apac|latam|europe)\b/i;

// Keep unknown/plain "Remote" (ambiguous) and anything with a US signal; drop postings that name a
// non-US place with no US location alongside (so "London, UK; San Francisco, CA" is kept).
export function isUsLocation(location?: string): boolean {
  if (!location) return true;
  if (US_SIGNAL.test(location) || US_STATE.test(location)) return true;
  return !NON_US.test(location);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GreenhouseFetcher implements JobFetcher {
  constructor(
    private readonly companies: Company[],
    private readonly delayMs = 300,
    // Weekdays reserved for the JSearch lane — Greenhouse skips these so each lane gets the full
    // analysis budget on its own days (JSearch's quota-limited big-tech sweep vs Greenhouse's
    // free full-description ATS pulls).
    private readonly skipOnDays: string[] = [],
  ) {}

  async fetch(criteria: SearchCriteria): Promise<Job[]> {
    const today = DAY_NAMES[new Date().getDay()];
    if (this.skipOnDays.some((d) => d.trim().toLowerCase().slice(0, 3) === today)) {
      logger.info(`Greenhouse: ${today} is a JSearch day — skipping so JSearch gets the full budget`);
      return [];
    }

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
        .map((raw) => this.mapJob(raw, company))
        .filter((job) => isUsLocation(job.location)); // boards list every geo; keep US-based roles

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
