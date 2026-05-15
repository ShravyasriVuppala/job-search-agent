import { getPool } from './client';

export interface WeeklyStats {
  jobsFetched: number;
  jobsAnalyzed: number;
  autoFlagged: number;
  maybeFlagged: number;
  applicationsSubmitted: number;
}

export interface DigestJob {
  jobId: string;
  title: string;
  company: string;
  location?: string;
  locationCategory?: string;
  applyUrl: string;
  relevanceScore: number;
  interviewChance: number;
  overallCategory: string;
  relevanceReasoning?: string;
  coverLetterDraft?: string;
  analyzedAt: Date;
}

export class DigestRepository {
  async getWeeklyStats(): Promise<WeeklyStats> {
    const pool = getPool();
    const [fetched, analyzed, applications] = await Promise.all([
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM jobs WHERE fetched_at > NOW() - INTERVAL '7 days'`,
      ),
      pool.query<{ total: string; auto_flag: string; maybe_flag: string }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE overall_category = 'auto-flag') AS auto_flag,
           COUNT(*) FILTER (WHERE overall_category = 'maybe-flag') AS maybe_flag
         FROM claude_analysis
         WHERE analyzed_at > NOW() - INTERVAL '7 days' AND is_stale = FALSE`,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM applications WHERE applied_at > NOW() - INTERVAL '7 days'`,
      ),
    ]);

    return {
      jobsFetched: parseInt(fetched.rows[0].count, 10),
      jobsAnalyzed: parseInt(analyzed.rows[0].total, 10),
      autoFlagged: parseInt(analyzed.rows[0].auto_flag, 10),
      maybeFlagged: parseInt(analyzed.rows[0].maybe_flag, 10),
      applicationsSubmitted: parseInt(applications.rows[0].count, 10),
    };
  }

  async getAutoFlaggedJobs(): Promise<DigestJob[]> {
    return this.getJobsByCategory('auto-flag');
  }

  async getMaybeFlaggedJobs(): Promise<DigestJob[]> {
    return this.getJobsByCategory('maybe-flag');
  }

  private async getJobsByCategory(category: string): Promise<DigestJob[]> {
    const pool = getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT
         j.id AS job_id, j.title, j.company, j.location, j.location_category, j.apply_url,
         ca.relevance_score, ca.interview_chance, ca.overall_category,
         ca.relevance_reasoning, ca.cover_letter_draft, ca.analyzed_at
       FROM jobs j
       JOIN claude_analysis ca ON ca.job_id = j.id
       WHERE ca.overall_category = $1
         AND ca.analyzed_at > NOW() - INTERVAL '7 days'
         AND ca.is_stale = FALSE
       ORDER BY ca.relevance_score DESC`,
      [category],
    );
    return result.rows.map((row) => ({
      jobId: row.job_id as string,
      title: row.title as string,
      company: row.company as string,
      location: row.location as string | undefined,
      locationCategory: row.location_category as string | undefined,
      applyUrl: row.apply_url as string,
      relevanceScore: parseFloat(row.relevance_score as string),
      interviewChance: parseFloat(row.interview_chance as string),
      overallCategory: row.overall_category as string,
      relevanceReasoning: row.relevance_reasoning as string | undefined,
      coverLetterDraft: row.cover_letter_draft as string | undefined,
      analyzedAt: row.analyzed_at as Date,
    }));
  }
}
