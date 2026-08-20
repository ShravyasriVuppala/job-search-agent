import axios from 'axios';
import { JSearchFetcher, capTerms } from '../src/services/job-fetchers/jsearch.fetcher';
import { GreenhouseFetcher, titleMatches, htmlToText } from '../src/services/job-fetchers/greenhouse.fetcher';
import type { JSearchConfig } from '../src/config/jsearch.config';
import type { Company } from '../src/config/companies.config';
import { HackerNewsAlgoliaFetcher } from '../src/services/job-fetchers/hackernews.fetcher';
import { RemoteOKFetcher } from '../src/services/job-fetchers/remoteok.fetcher';
import { AngelListFetcher } from '../src/services/job-fetchers/angelist.fetcher';
import { JobAggregatorService } from '../src/services/job-aggregator.service';
import { JobRepository } from '../src/db/job.repository';
import { SearchCriteria, Job } from '../src/types';
import { getPool, closePool } from '../src/db/client';

// Spy on axios.get rather than mocking the whole module so that
// axios.isAxiosError (a type predicate) keeps its real implementation.
let axiosGetSpy: jest.SpyInstance;

beforeEach(() => {
  axiosGetSpy = jest.spyOn(axios, 'get');
});

afterEach(() => {
  jest.restoreAllMocks();
});

jest.mock('../src/db/client');
const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;

afterAll(async () => {
  await closePool();
});

// Helper to create an object that axios.isAxiosError() recognises as an AxiosError.
function axiosError(status: number, message = 'Axios error') {
  return Object.assign(new Error(message), { isAxiosError: true, response: { status } });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const locationKeywords = {
  remote: ['remote'],
  washington: ['seattle', 'bellevue', 'tacoma', 'redmond', 'renton', 'kirkland', 'sammamish', 'auburn', 'kent', 'des moines', 'washington', '- wa'],
  other: [] as string[],
};

const criteria: SearchCriteria = {
  jobTitles: ['Senior Software Engineer', 'Staff Software Engineer'],
  locationPriority: ['remote', 'washington'],
  yearsExperience: 7,
  preferredStack: ['java', 'spring boot', 'kafka'],
  locationKeywords,
};

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Test config: one location + cadence covering every day, so the response-parsing tests issue
// exactly one query and never self-skip regardless of the day the suite runs.
const jsearchConfig: JSearchConfig = {
  cadence: [...DAY_NAMES],
  datePosted: 'week',
  maxRequestsPerRun: 15,
  minReserve: 5,
  locations: ['remote'],
};

// One title × one location = a single request, so a single mocked response maps to a single job.
const singleTitleCriteria: SearchCriteria = { ...criteria, jobTitles: ['Senior Software Engineer'] };

// ── JSearchFetcher ────────────────────────────────────────────────────────────

describe('JSearchFetcher', () => {
  it('normalizes a JSearch API response into Job objects', async () => {
    axiosGetSpy.mockResolvedValue({
      data: {
        data: [
          {
            job_id: 'jsearch-001',
            job_title: 'Senior Software Engineer',
            employer_name: 'Stripe',
            job_description: 'Java, Kafka, distributed systems',
            job_country: 'US',
            job_state: 'CA',
            job_min_salary: 150000,
            job_max_salary: 200000,
            salary_currency: 'USD',
            job_apply_link: 'https://stripe.com/jobs/1',
            job_posted_at_datetime_utc: '2026-05-01T08:00:00Z',
          },
        ],
      },
    });

    const fetcher = new JSearchFetcher('test-api-key', jsearchConfig);
    const jobs = await fetcher.fetch(singleTitleCriteria);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe('jsearch');
    expect(jobs[0].externalId).toBe('jsearch-001');
    expect(jobs[0].title).toBe('Senior Software Engineer');
    expect(jobs[0].company).toBe('Stripe');
    expect(jobs[0].salaryMin).toBe(150000);
    expect(jobs[0].applyUrl).toBe('https://stripe.com/jobs/1');
    expect(jobs[0].isActive).toBe(true);
  });

  it('parses recruiter and company fields when present in JSearch response', async () => {
    axiosGetSpy.mockResolvedValue({
      data: {
        data: [
          {
            job_id: 'jsearch-recruiter-001',
            job_title: 'Senior Software Engineer',
            employer_name: 'Google',
            job_description: 'Come build at scale.',
            job_country: 'US',
            job_state: 'CA',
            job_apply_link: 'https://careers.google.com/jobs/1',
            job_posted_at_datetime_utc: '2026-05-13T00:00:00Z',
            recruiter_name: 'John Smith',
            recruiter_email: 'john.smith@google.com',
            company_hiring_url: 'https://careers.google.com',
            company_size: 'Large',
            company_website: 'https://google.com',
          },
        ],
      },
    });

    const fetcher = new JSearchFetcher('test-api-key', jsearchConfig);
    const jobs = await fetcher.fetch(singleTitleCriteria);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].recruiterName).toBe('John Smith');
    expect(jobs[0].recruiterEmail).toBe('john.smith@google.com');
    expect(jobs[0].companyHiringUrl).toBe('https://careers.google.com');
    expect(jobs[0].companySize).toBe('Large');
    expect(jobs[0].companyWebsite).toBe('https://google.com');
  });

  it('stores undefined for recruiter fields absent from JSearch response', async () => {
    axiosGetSpy.mockResolvedValue({
      data: {
        data: [
          {
            job_id: 'jsearch-no-recruiter',
            job_title: 'Senior Software Engineer',
            employer_name: 'Stripe',
            job_description: 'Build payments infrastructure.',
            job_country: 'US',
            job_state: 'CA',
            job_apply_link: 'https://stripe.com/jobs/2',
          },
        ],
      },
    });

    const fetcher = new JSearchFetcher('test-api-key', jsearchConfig);
    const jobs = await fetcher.fetch(singleTitleCriteria);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].recruiterName).toBeUndefined();
    expect(jobs[0].recruiterEmail).toBeUndefined();
    expect(jobs[0].companyHiringUrl).toBeUndefined();
    expect(jobs[0].companySize).toBeUndefined();
    expect(jobs[0].companyWebsite).toBeUndefined();
  });

  it('sets locationCategory on each job using criteria.locationKeywords', async () => {
    axiosGetSpy.mockResolvedValue({
      data: {
        data: [
          {
            job_id: 'j-remote',
            job_title: 'SWE',
            employer_name: 'Acme',
            job_description: 'desc',
            job_country: 'US',
            job_state: 'Remote',
            job_apply_link: 'https://acme.com/jobs/r',
          },
          {
            job_id: 'j-bellevue',
            job_title: 'SWE',
            employer_name: 'Contoso',
            job_description: 'desc',
            job_country: 'US',
            job_state: 'WA',
            job_apply_link: 'https://contoso.com/jobs/b',
          },
          {
            job_id: 'j-ny',
            job_title: 'SWE',
            employer_name: 'BigCo',
            job_description: 'desc',
            job_country: 'US',
            job_state: 'NY',
            job_apply_link: 'https://bigco.com/jobs/n',
          },
        ],
      },
    });

    const fetcher = new JSearchFetcher('test-key', jsearchConfig);
    const jobs = await fetcher.fetch(singleTitleCriteria);

    expect(jobs).toHaveLength(3);
    expect(jobs.find((j) => j.externalId === 'j-remote')?.locationCategory).toBe('remote');
    expect(jobs.find((j) => j.externalId === 'j-bellevue')?.locationCategory).toBe('washington');
    expect(jobs.find((j) => j.externalId === 'j-ny')?.locationCategory).toBe('other');
  });

  it('returns [] and logs a warning on 429 rate limit', async () => {
    axiosGetSpy.mockRejectedValue(axiosError(429, 'Too Many Requests'));

    const fetcher = new JSearchFetcher('test-api-key', jsearchConfig);
    const jobs = await fetcher.fetch(singleTitleCriteria);

    expect(jobs).toHaveLength(0);
  });

  it('returns [] and logs an error on network failure', async () => {
    axiosGetSpy.mockRejectedValue(new Error('ECONNREFUSED'));

    const fetcher = new JSearchFetcher('test-api-key', jsearchConfig);
    const jobs = await fetcher.fetch(singleTitleCriteria);

    expect(jobs).toHaveLength(0);
  });

  it('issues one request per (title × location) pair', async () => {
    axiosGetSpy.mockResolvedValue({ data: { data: { jobs: [] } }, headers: {} });
    const config: JSearchConfig = { ...jsearchConfig, locations: ['remote', 'Seattle, WA'] };
    const twoTitles: SearchCriteria = { ...criteria, jobTitles: ['A', 'B'] };

    await new JSearchFetcher('k', config).fetch(twoTitles);

    expect(axiosGetSpy).toHaveBeenCalledTimes(4); // 2 titles × 2 locations
  });

  it('self-skips on a day outside the cadence and issues no requests', async () => {
    const today = DAY_NAMES[new Date().getDay()];
    const config: JSearchConfig = { ...jsearchConfig, cadence: DAY_NAMES.filter((d) => d !== today) };

    const jobs = await new JSearchFetcher('k', config).fetch(singleTitleCriteria);

    expect(jobs).toHaveLength(0);
    expect(axiosGetSpy).not.toHaveBeenCalled();
  });

  it('stops issuing queries once remaining quota drops below minReserve', async () => {
    axiosGetSpy.mockResolvedValue({
      data: { data: { jobs: [] } },
      headers: { 'x-ratelimit-requests-remaining': '3' },
    });
    const config: JSearchConfig = { ...jsearchConfig, minReserve: 10, locations: ['remote', 'Seattle, WA', 'US'] };
    const twoTitles: SearchCriteria = { ...criteria, jobTitles: ['A', 'B'] }; // matrix would be 2×3 = 6

    await new JSearchFetcher('k', config).fetch(twoTitles);

    expect(axiosGetSpy).toHaveBeenCalledTimes(1); // after call 1, remaining=3 < 10 → stop
  });

  it('capTerms keeps titles distinct up to 4, OR-ing any remainder', () => {
    expect(capTerms(['A', 'B', 'C'], 4)).toEqual(['A', 'B', 'C']);
    expect(capTerms(['A', 'B', 'C', 'D'], 4)).toEqual(['A', 'B', 'C', 'D']);
    expect(capTerms(['A', 'B', 'C', 'D', 'E'], 4)).toEqual(['A', 'B', 'C', 'D OR E']);
  });

  it('capTerms caps locations at 3, OR-ing any remainder', () => {
    expect(capTerms(['remote', 'Seattle', 'US'], 3)).toEqual(['remote', 'Seattle', 'US']);
    expect(capTerms(['remote', 'Seattle', 'US', 'NYC'], 3)).toEqual(['remote', 'Seattle', 'US OR NYC']);
  });

  it('capTerms trims, drops blanks, and handles an empty list', () => {
    expect(capTerms([], 4)).toEqual([]);
    expect(capTerms(['  A ', '', '  '], 4)).toEqual(['A']);
  });

  it('accepts full weekday names and mixed case in the cadence', async () => {
    axiosGetSpy.mockResolvedValue({ data: { data: { jobs: [] } }, headers: {} });
    const fullNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayFull = fullNames[new Date().getDay()].toUpperCase();
    const config: JSearchConfig = { ...jsearchConfig, cadence: [todayFull], locations: ['remote'] };

    await new JSearchFetcher('k', config).fetch(singleTitleCriteria);

    expect(axiosGetSpy).toHaveBeenCalled(); // did not self-skip despite the "MONDAY" form
  });
});

// ── HackerNewsAlgoliaFetcher ──────────────────────────────────────────────────

describe('HackerNewsAlgoliaFetcher', () => {
  it('normalizes HN Algolia hits into Job objects', async () => {
    axiosGetSpy.mockResolvedValue({
      data: {
        hits: [
          {
            objectID: 'hn-42001',
            title: 'Cloudflare is hiring Senior Software Engineers',
            url: 'https://cloudflare.com/careers/42001',
            text: 'We are looking for Java engineers...',
            created_at: '2026-05-01T10:00:00Z',
          },
          {
            // no url — should be filtered out
            objectID: 'hn-42002',
            title: 'Ask HN: Hiring post with no link',
            created_at: '2026-05-01T11:00:00Z',
          },
        ],
      },
    });

    const fetcher = new HackerNewsAlgoliaFetcher();
    const jobs = await fetcher.fetch(criteria);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe('hackernews');
    expect(jobs[0].externalId).toBe('hn-42001');
    expect(jobs[0].company).toBe('Cloudflare');
    expect(jobs[0].location).toBe('Remote');
    expect(jobs[0].applyUrl).toBe('https://cloudflare.com/careers/42001');
  });

  it('returns [] on network error', async () => {
    axiosGetSpy.mockRejectedValue(new Error('timeout'));
    const fetcher = new HackerNewsAlgoliaFetcher();
    const jobs = await fetcher.fetch(criteria);
    expect(jobs).toHaveLength(0);
  });
});

// ── RemoteOKFetcher ───────────────────────────────────────────────────────────

describe('RemoteOKFetcher', () => {
  it('filters jobs by preferred stack and skips the metadata first element', async () => {
    axiosGetSpy.mockResolvedValue({
      data: [
        { legal: 'Do not scrape this data' }, // metadata element — must be skipped
        {
          id: 'rok-001',
          title: 'Java Backend Engineer',
          company: 'Shopify',
          description: 'Spring Boot, Kafka, distributed systems',
          url: 'https://remoteok.com/l/rok-001',
          tags: ['java', 'kafka', 'backend'],
          epoch: 1746000000,
        },
        {
          id: 'rok-002',
          title: 'React Frontend Engineer',
          company: 'Vercel',
          description: 'React, Next.js, TypeScript',
          url: 'https://remoteok.com/l/rok-002',
          tags: ['react', 'typescript'],
          epoch: 1746000100,
        },
      ],
    });

    const fetcher = new RemoteOKFetcher();
    const jobs = await fetcher.fetch(criteria); // preferredStack has java/spring boot/kafka

    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalId).toBe('rok-001');
    expect(jobs[0].source).toBe('remoteok');
    expect(jobs[0].location).toBe('Remote');
  });

  it('filters out jobs with salary_max below $50k', async () => {
    axiosGetSpy.mockResolvedValue({
      data: [
        { legal: 'metadata' },
        {
          id: 'rok-low-pay',
          title: 'Java Intern',
          company: 'Startup',
          description: 'java kafka',
          url: 'https://remoteok.com/l/intern',
          tags: ['java'],
          salary_max: 30000,
          epoch: 1746000000,
        },
      ],
    });

    const fetcher = new RemoteOKFetcher();
    const jobs = await fetcher.fetch(criteria);
    expect(jobs).toHaveLength(0);
  });

  it('returns [] on fetch error', async () => {
    axiosGetSpy.mockRejectedValue(new Error('connection reset'));
    const fetcher = new RemoteOKFetcher();
    const jobs = await fetcher.fetch(criteria);
    expect(jobs).toHaveLength(0);
  });
});

// ── AngelListFetcher ──────────────────────────────────────────────────────────

describe('AngelListFetcher', () => {
  it('returns [] when API returns 401 (auth required)', async () => {
    axiosGetSpy.mockRejectedValue(axiosError(401, 'Unauthorized'));

    const fetcher = new AngelListFetcher();
    const jobs = await fetcher.fetch(criteria);
    expect(jobs).toHaveLength(0);
  });

  it('returns [] on any unexpected error', async () => {
    axiosGetSpy.mockRejectedValue(new Error('ENOTFOUND'));

    const fetcher = new AngelListFetcher();
    const jobs = await fetcher.fetch(criteria);
    expect(jobs).toHaveLength(0);
  });
});

// ── JobAggregatorService ──────────────────────────────────────────────────────

// ── GreenhouseFetcher ─────────────────────────────────────────────────────────

describe('GreenhouseFetcher', () => {
  const companies: Company[] = [{ name: 'Acme', provider: 'greenhouse', slug: 'acme' }];

  function boardResponse(jobs: Record<string, unknown>[]) {
    return { data: { jobs } };
  }

  it('normalizes a Greenhouse board response into Job objects', async () => {
    axiosGetSpy.mockResolvedValue(boardResponse([
      {
        id: 900001,
        title: 'Senior Software Engineer',
        location: { name: 'Remote' },
        content: '&lt;p&gt;Build &amp; scale systems&lt;/p&gt;',
        absolute_url: 'https://boards.greenhouse.io/acme/jobs/900001',
        updated_at: '2026-08-01T00:00:00Z',
      },
    ]));

    const jobs = await new GreenhouseFetcher(companies, 0).fetch(criteria);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe('greenhouse');
    expect(jobs[0].externalId).toBe('900001');
    expect(jobs[0].company).toBe('Acme');
    expect(jobs[0].applyUrl).toBe('https://boards.greenhouse.io/acme/jobs/900001');
    expect(jobs[0].description).toBe('Build & scale systems'); // HTML decoded + tags stripped
    expect(jobs[0].locationCategory).toBeUndefined(); // aggregator buckets it later
  });

  it('filters out non-engineering roles by title', async () => {
    axiosGetSpy.mockResolvedValue(boardResponse([
      { id: 1, title: 'Staff Software Engineer', location: { name: 'Remote' }, content: 'x', absolute_url: 'u1' },
      { id: 2, title: 'Account Executive', location: { name: 'NYC' }, content: 'x', absolute_url: 'u2' },
      { id: 3, title: 'Technical Recruiter', location: { name: 'SF' }, content: 'x', absolute_url: 'u3' },
    ]));

    const jobs = await new GreenhouseFetcher(companies, 0).fetch(criteria);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Staff Software Engineer');
  });

  it('skips a dead slug (404) and continues with the next board', async () => {
    const twoCompanies: Company[] = [
      { name: 'DeadCo', provider: 'greenhouse', slug: 'deadco' },
      { name: 'Acme', provider: 'greenhouse', slug: 'acme' },
    ];
    axiosGetSpy
      .mockRejectedValueOnce(axiosError(404, 'Not Found'))
      .mockResolvedValueOnce(boardResponse([
        { id: 7, title: 'Backend Engineer', location: { name: 'Remote' }, content: 'x', absolute_url: 'u' },
      ]));

    const jobs = await new GreenhouseFetcher(twoCompanies, 0).fetch(criteria);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].company).toBe('Acme');
  });

  it('processes only greenhouse-provider companies', async () => {
    axiosGetSpy.mockResolvedValue(boardResponse([]));
    const mixed: Company[] = [
      { name: 'Acme', provider: 'greenhouse', slug: 'acme' },
      { name: 'LeverCo', provider: 'lever', slug: 'leverco' },
    ];

    await new GreenhouseFetcher(mixed, 0).fetch(criteria);

    expect(axiosGetSpy).toHaveBeenCalledTimes(1);
    expect(String(axiosGetSpy.mock.calls[0][0])).toContain('/boards/acme/jobs');
  });

  it('returns [] when no companies are configured', async () => {
    const jobs = await new GreenhouseFetcher([], 0).fetch(criteria);
    expect(jobs).toHaveLength(0);
    expect(axiosGetSpy).not.toHaveBeenCalled();
  });

  it('titleMatches scopes to engineering roles and configured title phrases', () => {
    expect(titleMatches('Senior Software Engineer', [])).toBe(true);
    expect(titleMatches('Backend Developer', [])).toBe(true);
    expect(titleMatches('SDE II', [])).toBe(true);
    expect(titleMatches('AI Engineer', [])).toBe(true);
    expect(titleMatches('Account Executive', [])).toBe(false);
    expect(titleMatches('Technical Recruiter', [])).toBe(false);
    expect(titleMatches('Forward Deployed Specialist', ['Forward Deployed Specialist'])).toBe(true);
  });

  it('htmlToText decodes escaped HTML, strips tags, and normalizes whitespace', () => {
    expect(htmlToText('&lt;p&gt;Hello&lt;/p&gt;')).toBe('Hello');
    expect(htmlToText('&lt;ul&gt;&lt;li&gt;A&lt;/li&gt;  &lt;li&gt;B&lt;/li&gt;&lt;/ul&gt;')).toBe('A B');
    expect(htmlToText('R&amp;D &amp; more')).toBe('R&D & more');
    expect(htmlToText('Ben&#8217;s &#8220;role&#8221; &#8211; remote')).toBe('Ben\'s "role" - remote');
    expect(htmlToText('')).toBe('');
  });
});

describe('JobAggregatorService', () => {
  function makeJob(overrides: Partial<Job>): Job {
    return {
      source: 'test',
      externalId: 'test-1',
      title: 'Software Engineer',
      company: 'Acme',
      description: 'Java role',
      location: 'Remote',
      applyUrl: 'https://acme.com/job/1',
      isActive: true,
      ...overrides,
    };
  }

  function makeAggregator(fetchers: { fetch: jest.Mock }[]) {
    const mockRepo = { saveJobs: jest.fn().mockResolvedValue(undefined) } as unknown as JobRepository;
    return new JobAggregatorService(fetchers as never, mockRepo);
  }

  it('deduplicates the same role even when apply URLs differ across sources', async () => {
    // Same company/title/location, different URLs (board vs ATS) → one record.
    const fetcher1 = { fetch: jest.fn().mockResolvedValue([makeJob({ source: 'jsearch', applyUrl: 'https://board.com/jobs/be?utm_source=jsearch' })]) };
    const fetcher2 = { fetch: jest.fn().mockResolvedValue([makeJob({ source: 'greenhouse', applyUrl: 'https://boards.greenhouse.io/acme/jobs/123' })]) };

    const aggregator = makeAggregator([fetcher1, fetcher2]);
    const jobs = await aggregator.fetchAndStoreJobs(criteria);

    expect(jobs).toHaveLength(1);
  });

  it('prefers the ATS-sourced record on a collision (fuller description)', async () => {
    const jsearch = { fetch: jest.fn().mockResolvedValue([makeJob({ source: 'jsearch', description: 'short blurb' })]) };
    const greenhouse = { fetch: jest.fn().mockResolvedValue([makeJob({ source: 'greenhouse', description: 'a much fuller description straight from the company ATS' })]) };

    const aggregator = makeAggregator([jsearch, greenhouse]);
    const jobs = await aggregator.fetchAndStoreJobs(criteria);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe('greenhouse');
    expect(jobs[0].description).toContain('fuller description');
  });

  it('keeps distinct roles that differ in title', async () => {
    const fetcher = {
      fetch: jest.fn().mockResolvedValue([
        makeJob({ title: 'Senior Software Engineer' }),
        makeJob({ title: 'Staff Software Engineer' }),
      ]),
    };

    const aggregator = makeAggregator([fetcher]);
    const jobs = await aggregator.fetchAndStoreJobs(criteria);

    expect(jobs).toHaveLength(2);
  });

  it('canonicalizes apply URLs by stripping query strings', async () => {
    const fetcher = { fetch: jest.fn().mockResolvedValue([makeJob({ applyUrl: 'https://acme.com/job/1?utm_source=x&ref=y#frag' })]) };

    const aggregator = makeAggregator([fetcher]);
    const jobs = await aggregator.fetchAndStoreJobs(criteria);

    expect(jobs[0].applyUrl).toBe('https://acme.com/job/1');
  });

  it('categorizes locations correctly using config keywords', () => {
    const aggregator = makeAggregator([]);
    const kw = locationKeywords;

    // Remote
    expect(aggregator.categorizeLocation('Remote', kw)).toBe('remote');
    expect(aggregator.categorizeLocation('Work from home, remote', kw)).toBe('remote');
    expect(aggregator.categorizeLocation('REMOTE', kw)).toBe('remote');

    // Washington — major cities
    expect(aggregator.categorizeLocation('Seattle, WA', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('Bellevue, WA', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('Bellevue, Washington', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('Tacoma, Washington', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('Redmond, WA', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('Kirkland, WA', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('Renton, WA', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('Sammamish, WA', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('Auburn, WA', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('Kent, WA', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('US - WA', kw)).toBe('washington');
    expect(aggregator.categorizeLocation('SEATTLE', kw)).toBe('washington');

    // Other
    expect(aggregator.categorizeLocation('San Francisco, CA', kw)).toBe('other');
    expect(aggregator.categorizeLocation('New York, NY', kw)).toBe('other');
    expect(aggregator.categorizeLocation('Denver, CO', kw)).toBe('other');
    expect(aggregator.categorizeLocation('Austin, TX', kw)).toBe('other');
    expect(aggregator.categorizeLocation(undefined, kw)).toBe('other');
  });

  it('falls back to built-in defaults when no locationKeywords provided', () => {
    const aggregator = makeAggregator([]);
    expect(aggregator.categorizeLocation('Remote')).toBe('remote');
    expect(aggregator.categorizeLocation('Seattle, WA')).toBe('washington');
    expect(aggregator.categorizeLocation('New York, NY')).toBe('other');
  });

  it('continues fetching from other sources when one fetcher throws', async () => {
    const failFetcher = { fetch: jest.fn().mockRejectedValue(new Error('API down')) };
    const goodFetcher = {
      fetch: jest.fn().mockResolvedValue([makeJob({ applyUrl: 'https://good.com/job/1' })]),
    };

    const aggregator = makeAggregator([failFetcher, goodFetcher]);
    const jobs = await aggregator.fetchAndStoreJobs(criteria);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].applyUrl).toBe('https://good.com/job/1');
  });

  it('calls saveJobs on the repository with deduplicated jobs', async () => {
    const mockRepo = { saveJobs: jest.fn().mockResolvedValue(undefined) } as unknown as JobRepository;
    const fetcher = {
      fetch: jest.fn().mockResolvedValue([
        makeJob({ applyUrl: 'https://acme.com/job/1' }),
        makeJob({ applyUrl: 'https://acme.com/job/1' }), // duplicate
      ]),
    };

    const aggregator = new JobAggregatorService([fetcher as never], mockRepo);
    await aggregator.fetchAndStoreJobs(criteria);

    expect(mockRepo.saveJobs).toHaveBeenCalledTimes(1);
    const savedJobs = (mockRepo.saveJobs as jest.Mock).mock.calls[0][0] as Job[];
    expect(savedJobs).toHaveLength(1);
  });
});

// ── JobRepository ─────────────────────────────────────────────────────────────

describe('JobRepository', () => {
  const mockQuery = jest.fn();

  beforeEach(() => {
    mockQuery.mockReset();
    mockedGetPool.mockReturnValue({ query: mockQuery } as never);
  });

  it('saveJobs() inserts each job with correct SQL parameters', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const repo = new JobRepository();
    const job: Job = {
      source: 'jsearch',
      externalId: 'j-001',
      title: 'Senior Software Engineer',
      company: 'Stripe',
      description: 'Great role',
      location: 'Remote',
      locationCategory: 'remote',
      salaryMin: 150000,
      salaryMax: 200000,
      salaryCurrency: 'USD',
      applyUrl: 'https://stripe.com/jobs/1',
      postedAt: new Date('2026-05-01'),
      isActive: true,
    };

    await repo.saveJobs([job]);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO jobs');
    expect(sql).toContain('ON CONFLICT');
    expect(params[0]).toBe('jsearch');
    expect(params[1]).toBe('j-001');
    expect(params[10]).toBe('https://stripe.com/jobs/1');
  });

  it('saveJobs() skips empty array without hitting DB', async () => {
    const repo = new JobRepository();
    await repo.saveJobs([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('getJobsByLocationCategory() queries with the correct category filter', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 'uuid-1',
          source: 'remoteok',
          external_id: 'rok-001',
          title: 'Backend Engineer',
          company: 'Remote Co',
          description: 'Java role',
          location: 'Remote',
          location_category: 'remote',
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          apply_url: 'https://remoteco.com/job/1',
          posted_at: null,
          fetched_at: new Date(),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });

    const repo = new JobRepository();
    const jobs = await repo.getJobsByLocationCategory('remote');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('location_category = $1'),
      ['remote'],
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe('remoteok');
    expect(jobs[0].locationCategory).toBe('remote');
  });
});