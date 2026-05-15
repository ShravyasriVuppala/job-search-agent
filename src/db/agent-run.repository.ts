import { getPool } from './client';

export interface AgentRunMetrics {
  jobsFetched: number;
  jobsAnalyzed: number;
  autoFlagged: number;
  maybeFlagged: number;
  skipped: number;
  patternsUpserted: number;
  tokensInput: number;
  tokensOutput: number;
}

export interface AgentRun {
  id: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  durationSeconds?: number;
  jobsFetched: number;
  jobsAnalyzed: number;
  autoFlagged: number;
  maybeFlagged: number;
  skipped: number;
  patternsUpserted: number;
  tokensInput: number;
  tokensOutput: number;
  errorMessage?: string;
  createdAt: Date;
}

export class AgentRunRepository {
  async startRun(): Promise<string> {
    const pool = getPool();
    const result = await pool.query<{ id: string }>(
      `INSERT INTO agent_runs (status, started_at) VALUES ('running', NOW()) RETURNING id`,
    );
    return result.rows[0].id;
  }

  async completeRun(id: string, metrics: AgentRunMetrics): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE agent_runs
       SET status = 'completed',
           completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
           jobs_fetched = $2,
           jobs_analyzed = $3,
           auto_flagged = $4,
           maybe_flagged = $5,
           skipped = $6,
           patterns_upserted = $7,
           tokens_input = $8,
           tokens_output = $9
       WHERE id = $1`,
      [
        id,
        metrics.jobsFetched,
        metrics.jobsAnalyzed,
        metrics.autoFlagged,
        metrics.maybeFlagged,
        metrics.skipped,
        metrics.patternsUpserted,
        metrics.tokensInput,
        metrics.tokensOutput,
      ],
    );
  }

  async failRun(id: string, errorMessage: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE agent_runs
       SET status = 'failed',
           completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
           error_message = $2
       WHERE id = $1`,
      [id, errorMessage],
    );
  }

  async getRecentRuns(limit = 30): Promise<AgentRun[]> {
    const pool = getPool();
    const result = await pool.query<{
      id: string;
      status: string;
      started_at: Date;
      completed_at: Date | null;
      duration_seconds: number | null;
      jobs_fetched: number;
      jobs_analyzed: number;
      auto_flagged: number;
      maybe_flagged: number;
      skipped: number;
      patterns_upserted: number;
      tokens_input: number;
      tokens_output: number;
      error_message: string | null;
      created_at: Date;
    }>(
      `SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );

    return result.rows.map((r) => ({
      id: r.id,
      status: r.status as AgentRun['status'],
      startedAt: r.started_at,
      completedAt: r.completed_at ?? undefined,
      durationSeconds: r.duration_seconds ?? undefined,
      jobsFetched: r.jobs_fetched,
      jobsAnalyzed: r.jobs_analyzed,
      autoFlagged: r.auto_flagged,
      maybeFlagged: r.maybe_flagged,
      skipped: r.skipped,
      patternsUpserted: r.patterns_upserted,
      tokensInput: r.tokens_input,
      tokensOutput: r.tokens_output,
      errorMessage: r.error_message ?? undefined,
      createdAt: r.created_at,
    }));
  }
}
