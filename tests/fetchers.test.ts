import axios from 'axios';
import { JSearchFetcher } from '../src/services/job-fetchers/jsearch.fetcher';
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

    const fetcher = new JSearchFetcher('test-api-key');
    const jobs = await fetcher.fetch(criteria);

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

    const fetcher = new JSearchFetcher('test-api-key');
    const jobs = await fetcher.fetch(criteria);

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

    const fetcher = new JSearchFetcher('test-api-key');
    const jobs = await fetcher.fetch(criteria);

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

    const fetcher = new JSearchFetcher('test-key');
    const jobs = await fetcher.fetch(criteria);

    expect(jobs).toHaveLength(3);
    expect(jobs.find((j) => j.externalId === 'j-remote')?.locationCategory).toBe('remote');
    expect(jobs.find((j) => j.externalId === 'j-bellevue')?.locationCategory).toBe('washington');
    expect(jobs.find((j) => j.externalId === 'j-ny')?.locationCategory).toBe('other');
  });

  it('returns [] and logs a warning on 429 rate limit', async () => {
    axiosGetSpy.mockRejectedValue(axiosError(429, 'Too Many Requests'));

    const fetcher = new JSearchFetcher('test-api-key');
    const jobs = await fetcher.fetch(criteria);

    expect(jobs).toHaveLength(0);
  });

  it('returns [] and logs an error on network failure', async () => {
    axiosGetSpy.mockRejectedValue(new Error('ECONNREFUSED'));

    const fetcher = new JSearchFetcher('test-api-key');
    const jobs = await fetcher.fetch(criteria);

    expect(jobs).toHaveLength(0);
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

  it('deduplicates jobs with the same apply_url across sources', async () => {
    const sharedUrl = 'https://company.com/jobs/backend-engineer';
    const fetcher1 = { fetch: jest.fn().mockResolvedValue([makeJob({ source: 'jsearch', applyUrl: sharedUrl })]) };
    const fetcher2 = { fetch: jest.fn().mockResolvedValue([makeJob({ source: 'hackernews', applyUrl: sharedUrl })]) };

    const aggregator = makeAggregator([fetcher1, fetcher2]);
    const jobs = await aggregator.fetchAndStoreJobs(criteria);

    expect(jobs).toHaveLength(1);
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