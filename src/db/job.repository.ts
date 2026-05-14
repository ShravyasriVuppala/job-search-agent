import { getPool } from './client';
import { Job } from '../types';

export class JobRepository {
  async saveJobs(jobs: Job[]): Promise<void> {
    if (jobs.length === 0) return;
    const pool = getPool();
    for (const job of jobs) {
      try {
        await pool.query(
          `INSERT INTO jobs (
            source, external_id, title, company, description,
            location, location_category,
            salary_min, salary_max, salary_currency,
            apply_url, posted_at, is_active,
            recruiter_name, recruiter_email,
            company_hiring_url, company_size, company_website
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          ON CONFLICT (source, external_id) DO NOTHING`,
          [
            job.source,
            job.externalId,
            job.title,
            job.company,
            job.description,
            job.location ?? null,
            job.locationCategory ?? null,
            job.salaryMin ?? null,
            job.salaryMax ?? null,
            job.salaryCurrency ?? null,
            job.applyUrl,
            job.postedAt ?? null,
            job.isActive,
            job.recruiterName ?? null,
            job.recruiterEmail ?? null,
            job.companyHiringUrl ?? null,
            job.companySize ?? null,
            job.companyWebsite ?? null,
          ],
        );
      } catch (err: unknown) {
        // 23505 = unique_violation — apply_url duplicate from a different source
        if ((err as { code?: string }).code === '23505') continue;
        throw err;
      }
    }
  }

  async getJobsSinceLastRun(): Promise<Job[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM jobs
       WHERE fetched_at > NOW() - INTERVAL '1 day'
       ORDER BY posted_at DESC`,
    );
    return result.rows.map(mapRow);
  }

  async getJobsByLocationCategory(category: string): Promise<Job[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM jobs WHERE location_category = $1 ORDER BY posted_at DESC`,
      [category],
    );
    return result.rows.map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    source: row.source as string,
    externalId: row.external_id as string,
    title: row.title as string,
    company: row.company as string,
    description: row.description as string,
    location: row.location as string | undefined,
    locationCategory: row.location_category as string | undefined,
    salaryMin: row.salary_min as number | undefined,
    salaryMax: row.salary_max as number | undefined,
    salaryCurrency: row.salary_currency as string | undefined,
    applyUrl: row.apply_url as string,
    postedAt: row.posted_at as Date | undefined,
    fetchedAt: row.fetched_at as Date | undefined,
    isActive: row.is_active as boolean,
    recruiterName: row.recruiter_name as string | undefined,
    recruiterEmail: row.recruiter_email as string | undefined,
    companyHiringUrl: row.company_hiring_url as string | undefined,
    companySize: row.company_size as string | undefined,
    companyWebsite: row.company_website as string | undefined,
    createdAt: row.created_at as Date | undefined,
    updatedAt: row.updated_at as Date | undefined,
  };
}