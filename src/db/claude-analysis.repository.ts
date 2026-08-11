import { getPool } from './client';
import { ClaudeAnalysis, JobAnalysisResult, LocationCategory, OverallCategory } from '../types';

export class ClaudeAnalysisRepository {
  async saveAnalysis(
    jobId: string,
    analysis: JobAnalysisResult,
    locationCategory: string,
    coverLetterDraft?: string,
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO claude_analysis (
        job_id, relevance_score, interview_chance,
        location_category, overall_category,
        relevance_reasoning, insights,
        cover_letter_draft, matched_patterns
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (job_id) DO UPDATE SET
        relevance_score     = EXCLUDED.relevance_score,
        interview_chance    = EXCLUDED.interview_chance,
        overall_category    = EXCLUDED.overall_category,
        relevance_reasoning = EXCLUDED.relevance_reasoning,
        insights            = EXCLUDED.insights,
        cover_letter_draft  = EXCLUDED.cover_letter_draft,
        matched_patterns    = EXCLUDED.matched_patterns,
        is_stale            = FALSE,
        analyzed_at         = CURRENT_TIMESTAMP`,
      [
        jobId,
        analysis.relevanceScore,
        analysis.interviewChance,
        locationCategory,
        analysis.overallCategory,
        analysis.relevanceReasoning,
        analysis.insights,
        coverLetterDraft ?? null,
        analysis.matchedPatterns,
      ],
    );
  }

  // Lazily persist a cover letter generated on demand (Task 3), leaving the rest of the
  // analysis untouched.
  async updateCoverLetter(jobId: string, draft: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE claude_analysis SET cover_letter_draft = $2 WHERE job_id = $1`,
      [jobId, draft],
    );
  }

  async getAnalysesByCategory(category: string): Promise<ClaudeAnalysis[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM claude_analysis
       WHERE overall_category = $1 AND is_stale = FALSE
       ORDER BY relevance_score DESC`,
      [category],
    );
    return result.rows.map(mapRow);
  }

  async getRecentAnalyses(limit = 20): Promise<ClaudeAnalysis[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM claude_analysis
       WHERE is_stale = FALSE
       ORDER BY analyzed_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(mapRow);
  }

  async getAnalysisByJobId(jobId: string): Promise<ClaudeAnalysis | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM claude_analysis WHERE job_id = $1`,
      [jobId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}

export interface JobWithAnalysis {
  jobId: string;
  title: string;
  company: string;
  location?: string;
  locationCategory?: string;
  applyUrl: string;
  source: string;
  recruiterName?: string;
  recruiterEmail?: string;
  companyHiringUrl?: string;
  companySize?: string;
  companyWebsite?: string;
  relevanceScore: number;
  interviewChance: number;
  overallCategory: string;
  relevanceReasoning?: string;
  insights?: string;
  matchedPatterns?: string[];
  coverLetterDraft?: string;
  analyzedAt?: Date;
}

export interface AnalysisWithJob {
  job: {
    id: string;
    title: string;
    company: string;
    location?: string;
    locationCategory?: string;
    description?: string;
    applyUrl: string;
    source: string;
    recruiterName?: string;
    recruiterEmail?: string;
    companyHiringUrl?: string;
    companySize?: string;
    companyWebsite?: string;
  };
  analysis: {
    id: string;
    relevanceScore: number;
    interviewChance: number;
    overallCategory: string;
    relevanceReasoning?: string;
    insights?: string;
    matchedPatterns?: string[];
    coverLetterDraft?: string;
    analyzedAt?: Date;
  };
}

// Used only by getJobWithOptionalAnalysis (LEFT JOIN — analysis may be absent)
export interface JobDetailResult {
  job: AnalysisWithJob['job'] & { isSaved: boolean; isNotInterested: boolean };
  analysis: AnalysisWithJob['analysis'] | null;
}

export interface RawJobWithOptionalAnalysis {
  id: string;
  title: string;
  company: string;
  location?: string;
  locationCategory?: string;
  applyUrl: string;
  source: string;
  postedAt?: Date;
  fetchedAt?: Date;
  isAnalyzed: boolean;
  relevanceScore?: number;
  interviewChance?: number;
  overallCategory?: string;
  analyzedAt?: Date;
  isSaved: boolean;
  isNotInterested: boolean;
}

export class ClaudeAnalysisQueryRepository {
  async getJobsWithAnalysis(category: string): Promise<JobWithAnalysis[]> {
    const pool = getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT
         j.id AS job_id, j.title, j.company, j.location,
         j.location_category, j.apply_url, j.source,
         j.recruiter_name, j.recruiter_email,
         j.company_hiring_url, j.company_size, j.company_website,
         ca.relevance_score, ca.interview_chance, ca.overall_category,
         ca.relevance_reasoning, ca.insights, ca.matched_patterns,
         ca.cover_letter_draft, ca.analyzed_at
       FROM jobs j
       JOIN claude_analysis ca ON j.id = ca.job_id
       WHERE ca.overall_category = $1 AND ca.is_stale = FALSE
       ORDER BY ca.relevance_score DESC`,
      [category],
    );
    return result.rows.map(mapJoinRow);
  }

  async getJobsByLocation(category: string): Promise<JobWithAnalysis[]> {
    const pool = getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT
         j.id AS job_id, j.title, j.company, j.location,
         j.location_category, j.apply_url, j.source,
         j.recruiter_name, j.recruiter_email,
         j.company_hiring_url, j.company_size, j.company_website,
         ca.relevance_score, ca.interview_chance, ca.overall_category,
         ca.relevance_reasoning, ca.insights, ca.matched_patterns,
         ca.cover_letter_draft, ca.analyzed_at
       FROM jobs j
       JOIN claude_analysis ca ON j.id = ca.job_id
       WHERE j.location_category = $1 AND ca.is_stale = FALSE
       ORDER BY ca.relevance_score DESC`,
      [category],
    );
    return result.rows.map(mapJoinRow);
  }

  async getAllWithJobs(limit = 50, offset = 0): Promise<{ rows: AnalysisWithJob[]; total: number }> {
    const pool = getPool();
    const [dataResult, countResult] = await Promise.all([
      pool.query<Record<string, unknown>>(
        `SELECT
           j.id AS job_id, j.title, j.company, j.location, j.location_category,
           j.apply_url, j.source,
           j.recruiter_name, j.recruiter_email,
           j.company_hiring_url, j.company_size, j.company_website,
           ca.id AS analysis_id, ca.relevance_score, ca.interview_chance,
           ca.overall_category, ca.relevance_reasoning, ca.insights,
           ca.matched_patterns, ca.cover_letter_draft, ca.analyzed_at,
           (ji_s.id IS NOT NULL) AS is_saved,
           (ji_ni.id IS NOT NULL) AS is_not_interested,
           (a.id IS NOT NULL) AS is_applied
         FROM jobs j
         JOIN claude_analysis ca ON j.id = ca.job_id
         LEFT JOIN job_interactions ji_s ON ji_s.job_id = j.id AND ji_s.interaction_type = 'saved'
         LEFT JOIN job_interactions ji_ni ON ji_ni.job_id = j.id AND ji_ni.interaction_type = 'not_interested'
         LEFT JOIN applications a ON a.job_id = j.id
         WHERE ca.is_stale = FALSE
         ORDER BY ca.analyzed_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM claude_analysis WHERE is_stale = FALSE`),
    ]);

    const rows = dataResult.rows.map((row) => ({
      job: {
        id: row.job_id as string,
        title: row.title as string,
        company: row.company as string,
        location: row.location as string | undefined,
        locationCategory: row.location_category as string | undefined,
        applyUrl: row.apply_url as string,
        source: row.source as string,
        recruiterName: row.recruiter_name as string | undefined,
        recruiterEmail: row.recruiter_email as string | undefined,
        companyHiringUrl: row.company_hiring_url as string | undefined,
        companySize: row.company_size as string | undefined,
        companyWebsite: row.company_website as string | undefined,
        isSaved: row.is_saved as boolean,
        isNotInterested: row.is_not_interested as boolean,
        isApplied: row.is_applied as boolean,
      },
      analysis: {
        id: row.analysis_id as string,
        relevanceScore: parseFloat(row.relevance_score as string),
        interviewChance: parseFloat(row.interview_chance as string),
        overallCategory: row.overall_category as string,
        relevanceReasoning: row.relevance_reasoning as string | undefined,
        insights: row.insights as string | undefined,
        matchedPatterns: row.matched_patterns as string[] | undefined,
        coverLetterDraft: row.cover_letter_draft as string | undefined,
        analyzedAt: row.analyzed_at as Date | undefined,
      },
    }));

    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async getAllJobs(limit = 100, offset = 0): Promise<{ rows: RawJobWithOptionalAnalysis[]; total: number }> {
    const pool = getPool();
    const [dataResult, countResult] = await Promise.all([
      pool.query<Record<string, unknown>>(
        `SELECT
           j.id, j.title, j.company, j.location, j.location_category,
           j.apply_url, j.source, j.posted_at, j.fetched_at,
           ca.relevance_score, ca.interview_chance, ca.overall_category, ca.analyzed_at,
           (ji_s.id IS NOT NULL) AS is_saved,
           (ji_ni.id IS NOT NULL) AS is_not_interested
         FROM jobs j
         LEFT JOIN claude_analysis ca ON ca.job_id = j.id AND ca.is_stale = FALSE
         LEFT JOIN job_interactions ji_s ON ji_s.job_id = j.id AND ji_s.interaction_type = 'saved'
         LEFT JOIN job_interactions ji_ni ON ji_ni.job_id = j.id AND ji_ni.interaction_type = 'not_interested'
         ORDER BY j.posted_at DESC NULLS LAST
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      pool.query<{ count: string }>(`SELECT COUNT(*) FROM jobs`),
    ]);

    const rows = dataResult.rows.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      company: row.company as string,
      location: row.location as string | undefined,
      locationCategory: row.location_category as string | undefined,
      applyUrl: row.apply_url as string,
      source: row.source as string,
      postedAt: row.posted_at as Date | undefined,
      fetchedAt: row.fetched_at as Date | undefined,
      isAnalyzed: row.overall_category != null,
      relevanceScore: row.relevance_score != null ? parseFloat(row.relevance_score as string) : undefined,
      interviewChance: row.interview_chance != null ? parseFloat(row.interview_chance as string) : undefined,
      overallCategory: row.overall_category as string | undefined,
      analyzedAt: row.analyzed_at as Date | undefined,
      isSaved: row.is_saved as boolean,
      isNotInterested: row.is_not_interested as boolean,
    }));

    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async getSavedJobs(limit = 200, offset = 0): Promise<{ rows: RawJobWithOptionalAnalysis[]; total: number }> {
    const pool = getPool();
    const [dataResult, countResult] = await Promise.all([
      pool.query<Record<string, unknown>>(
        `SELECT
           j.id, j.title, j.company, j.location, j.location_category,
           j.apply_url, j.source, j.posted_at, j.fetched_at,
           ca.relevance_score, ca.interview_chance, ca.overall_category, ca.analyzed_at,
           TRUE AS is_saved,
           (ji_ni.id IS NOT NULL) AS is_not_interested
         FROM jobs j
         JOIN job_interactions ji_s ON ji_s.job_id = j.id AND ji_s.interaction_type = 'saved'
         LEFT JOIN claude_analysis ca ON ca.job_id = j.id AND ca.is_stale = FALSE
         LEFT JOIN job_interactions ji_ni ON ji_ni.job_id = j.id AND ji_ni.interaction_type = 'not_interested'
         ORDER BY ji_s.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM job_interactions WHERE interaction_type = 'saved'`,
      ),
    ]);

    const rows = dataResult.rows.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      company: row.company as string,
      location: row.location as string | undefined,
      locationCategory: row.location_category as string | undefined,
      applyUrl: row.apply_url as string,
      source: row.source as string,
      postedAt: row.posted_at as Date | undefined,
      fetchedAt: row.fetched_at as Date | undefined,
      isAnalyzed: row.overall_category != null,
      relevanceScore: row.relevance_score != null ? parseFloat(row.relevance_score as string) : undefined,
      interviewChance: row.interview_chance != null ? parseFloat(row.interview_chance as string) : undefined,
      overallCategory: row.overall_category as string | undefined,
      analyzedAt: row.analyzed_at as Date | undefined,
      isSaved: true,
      isNotInterested: row.is_not_interested as boolean,
    }));

    return { rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async getJobWithOptionalAnalysis(jobId: string): Promise<JobDetailResult | null> {
    const pool = getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT
         j.id AS job_id, j.title, j.company, j.location, j.location_category,
         j.description, j.apply_url, j.source, j.posted_at,
         j.recruiter_name, j.recruiter_email,
         j.company_hiring_url, j.company_size, j.company_website,
         ca.id AS analysis_id, ca.relevance_score, ca.interview_chance,
         ca.overall_category, ca.relevance_reasoning, ca.insights,
         ca.matched_patterns, ca.cover_letter_draft, ca.analyzed_at,
         (ji_s.id IS NOT NULL) AS is_saved,
         (ji_ni.id IS NOT NULL) AS is_not_interested
       FROM jobs j
       LEFT JOIN claude_analysis ca ON ca.job_id = j.id AND ca.is_stale = FALSE
       LEFT JOIN job_interactions ji_s ON ji_s.job_id = j.id AND ji_s.interaction_type = 'saved'
       LEFT JOIN job_interactions ji_ni ON ji_ni.job_id = j.id AND ji_ni.interaction_type = 'not_interested'
       WHERE j.id = $1`,
      [jobId],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    const hasAnalysis = row.analysis_id != null;
    return {
      job: {
        id: row.job_id as string,
        title: row.title as string,
        company: row.company as string,
        location: row.location as string | undefined,
        locationCategory: row.location_category as string | undefined,
        description: row.description as string | undefined,
        applyUrl: row.apply_url as string,
        source: row.source as string,
        recruiterName: row.recruiter_name as string | undefined,
        recruiterEmail: row.recruiter_email as string | undefined,
        companyHiringUrl: row.company_hiring_url as string | undefined,
        companySize: row.company_size as string | undefined,
        companyWebsite: row.company_website as string | undefined,
        isSaved: row.is_saved as boolean,
        isNotInterested: row.is_not_interested as boolean,
      },
      analysis: hasAnalysis
        ? {
            id: row.analysis_id as string,
            relevanceScore: parseFloat(row.relevance_score as string),
            interviewChance: parseFloat(row.interview_chance as string),
            overallCategory: row.overall_category as string,
            relevanceReasoning: row.relevance_reasoning as string | undefined,
            insights: row.insights as string | undefined,
            matchedPatterns: row.matched_patterns as string[] | undefined,
            coverLetterDraft: row.cover_letter_draft as string | undefined,
            analyzedAt: row.analyzed_at as Date | undefined,
          }
        : null,
    };
  }

  async getWithJob(jobId: string): Promise<AnalysisWithJob | null> {
    const pool = getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT
         j.id AS job_id, j.title, j.company, j.location, j.location_category,
         j.description, j.apply_url, j.source,
         j.recruiter_name, j.recruiter_email,
         j.company_hiring_url, j.company_size, j.company_website,
         ca.id AS analysis_id, ca.relevance_score, ca.interview_chance,
         ca.overall_category, ca.relevance_reasoning, ca.insights,
         ca.matched_patterns, ca.cover_letter_draft, ca.analyzed_at
       FROM jobs j
       JOIN claude_analysis ca ON j.id = ca.job_id
       WHERE j.id = $1`,
      [jobId],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      job: {
        id: row.job_id as string,
        title: row.title as string,
        company: row.company as string,
        location: row.location as string | undefined,
        locationCategory: row.location_category as string | undefined,
        description: row.description as string | undefined,
        applyUrl: row.apply_url as string,
        source: row.source as string,
        recruiterName: row.recruiter_name as string | undefined,
        recruiterEmail: row.recruiter_email as string | undefined,
        companyHiringUrl: row.company_hiring_url as string | undefined,
        companySize: row.company_size as string | undefined,
        companyWebsite: row.company_website as string | undefined,
      },
      analysis: {
        id: row.analysis_id as string,
        relevanceScore: parseFloat(row.relevance_score as string),
        interviewChance: parseFloat(row.interview_chance as string),
        overallCategory: row.overall_category as string,
        relevanceReasoning: row.relevance_reasoning as string | undefined,
        insights: row.insights as string | undefined,
        matchedPatterns: row.matched_patterns as string[] | undefined,
        coverLetterDraft: row.cover_letter_draft as string | undefined,
        analyzedAt: row.analyzed_at as Date | undefined,
      },
    };
  }
}

function mapJoinRow(row: Record<string, unknown>): JobWithAnalysis {
  return {
    jobId: row.job_id as string,
    title: row.title as string,
    company: row.company as string,
    location: row.location as string | undefined,
    locationCategory: row.location_category as string | undefined,
    applyUrl: row.apply_url as string,
    source: row.source as string,
    recruiterName: row.recruiter_name as string | undefined,
    recruiterEmail: row.recruiter_email as string | undefined,
    companyHiringUrl: row.company_hiring_url as string | undefined,
    companySize: row.company_size as string | undefined,
    companyWebsite: row.company_website as string | undefined,
    relevanceScore: parseFloat(row.relevance_score as string),
    interviewChance: parseFloat(row.interview_chance as string),
    overallCategory: row.overall_category as string,
    relevanceReasoning: row.relevance_reasoning as string | undefined,
    insights: row.insights as string | undefined,
    matchedPatterns: row.matched_patterns as string[] | undefined,
    coverLetterDraft: row.cover_letter_draft as string | undefined,
    analyzedAt: row.analyzed_at as Date | undefined,
  };
}

function mapRow(row: Record<string, unknown>): ClaudeAnalysis {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    relevanceScore: parseFloat(row.relevance_score as string),
    interviewChance: parseFloat(row.interview_chance as string),
    locationCategory: row.location_category as LocationCategory,
    overallCategory: row.overall_category as OverallCategory,
    relevanceReasoning: row.relevance_reasoning as string | undefined,
    insights: row.insights as string | undefined,
    coverLetterDraft: row.cover_letter_draft as string | undefined,
    matchedPatterns: row.matched_patterns as string[] | undefined,
    isStale: row.is_stale as boolean,
    staleReason: row.stale_reason as string | undefined,
    analyzedAt: row.analyzed_at as Date | undefined,
    createdAt: row.created_at as Date | undefined,
  };
}