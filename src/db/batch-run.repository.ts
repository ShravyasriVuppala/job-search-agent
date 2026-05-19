import { getPool } from './client';
import { logger } from '../utils/logger';

export interface BatchRun {
  id: string;
  batchId: string;
  status: 'pending' | 'completed' | 'failed';
  jobIds: string[];
  jobsFetched: number;
  runId?: string;
  submittedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export class BatchRunRepository {
  async createBatchRun(
    batchId: string,
    jobIds: string[],
    jobsFetched: number,
    runId?: string,
  ): Promise<string> {
    const pool = getPool();
    const result = await pool.query<{ id: string }>(
      `INSERT INTO batch_runs (batch_id, job_ids, jobs_fetched, run_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [batchId, jobIds, jobsFetched, runId ?? null],
    );
    return result.rows[0].id;
  }

  async getPendingBatches(): Promise<BatchRun[]> {
    const pool = getPool();
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM batch_runs WHERE status = 'pending' ORDER BY submitted_at ASC`,
    );
    return result.rows.map(mapRow);
  }

  async completeBatch(id: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE batch_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async failBatch(id: string, errorMessage: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE batch_runs
       SET status = 'failed', completed_at = NOW(), error_message = $2
       WHERE id = $1`,
      [id, errorMessage],
    );
  }

  // Anthropic expires batches after 24h. Atomically fail stale batch_runs rows
  // and their linked agent_runs so nothing stays stuck as 'running' indefinitely.
  async failStaleBatches(): Promise<void> {
    const pool = getPool();
    const result = await pool.query<{ batch_count: string }>(
      `WITH expired AS (
         UPDATE batch_runs
         SET status = 'failed',
             completed_at = NOW(),
             error_message = 'Batch expired — Anthropic 24h window elapsed'
         WHERE status = 'pending'
           AND submitted_at < NOW() - INTERVAL '25 hours'
         RETURNING id, run_id
       ),
       failed_runs AS (
         UPDATE agent_runs
         SET status = 'failed',
             completed_at = NOW(),
             duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
             error_message = 'Batch expired — Anthropic 24h window elapsed'
         WHERE id IN (SELECT run_id FROM expired WHERE run_id IS NOT NULL)
       )
       SELECT COUNT(*) AS batch_count FROM expired`,
    );
    const count = parseInt(result.rows[0]?.batch_count ?? '0', 10);
    if (count > 0) {
      logger.warn(`Marked ${count} stale batch(es) and their agent runs as failed`);
    }
  }
}

function mapRow(row: Record<string, unknown>): BatchRun {
  return {
    id: row.id as string,
    batchId: row.batch_id as string,
    status: row.status as BatchRun['status'],
    jobIds: row.job_ids as string[],
    jobsFetched: row.jobs_fetched as number,
    runId: row.run_id as string | undefined,
    submittedAt: row.submitted_at as Date,
    completedAt: row.completed_at as Date | undefined,
    errorMessage: row.error_message as string | undefined,
  };
}
