import { getPool } from './client';
import { Application, ApplicationStatus } from '../types';

export class ApplicationRepository {
  async recordApplication(jobId: string): Promise<Application> {
    const pool = getPool();
    const result = await pool.query<Record<string, unknown>>(
      `INSERT INTO applications (job_id)
       VALUES ($1)
       ON CONFLICT (job_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [jobId],
    );
    return mapRow(result.rows[0]);
  }

  async getApplications(): Promise<ApplicationWithJob[]> {
    const pool = getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT
         a.id, a.job_id, a.applied_at, a.status, a.created_at, a.updated_at,
         j.title, j.company, j.location, j.apply_url
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       ORDER BY a.applied_at DESC`,
    );
    return result.rows.map(mapRowWithJob);
  }

  async updateApplicationStatus(
    jobId: string,
    status: ApplicationStatus,
  ): Promise<Application | null> {
    const pool = getPool();
    const result = await pool.query<Record<string, unknown>>(
      `UPDATE applications
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE job_id = $2
       RETURNING *`,
      [status, jobId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}

export interface ApplicationWithJob {
  id: string;
  jobId: string;
  appliedAt: Date;
  status: ApplicationStatus;
  title: string;
  company: string;
  location?: string;
  applyUrl: string;
}

function mapRow(row: Record<string, unknown>): Application {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    appliedAt: row.applied_at as Date,
    status: row.status as ApplicationStatus,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function mapRowWithJob(row: Record<string, unknown>): ApplicationWithJob {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    appliedAt: row.applied_at as Date,
    status: row.status as ApplicationStatus,
    title: row.title as string,
    company: row.company as string,
    location: row.location as string | undefined,
    applyUrl: row.apply_url as string,
  };
}
