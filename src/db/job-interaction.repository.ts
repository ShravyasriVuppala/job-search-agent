import { getPool } from './client';

export class JobInteractionRepository {
  async setInteraction(jobId: string, type: 'saved' | 'not_interested', active: boolean): Promise<void> {
    const pool = getPool();
    if (active) {
      await pool.query(
        `INSERT INTO job_interactions (job_id, interaction_type)
         VALUES ($1, $2)
         ON CONFLICT (job_id, interaction_type) DO NOTHING`,
        [jobId, type],
      );
    } else {
      await pool.query(
        `DELETE FROM job_interactions WHERE job_id = $1 AND interaction_type = $2`,
        [jobId, type],
      );
    }
  }
}
