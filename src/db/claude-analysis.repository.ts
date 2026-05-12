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