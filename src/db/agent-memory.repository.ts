import { AgentMemory } from '../types';
import { getPool } from './client';
import { logger } from '../utils/logger';

export class AgentMemoryRepository {
  async getAll(): Promise<AgentMemory[]> {
    const pool = getPool();
    const result = await pool.query<{
      id: string;
      pattern_name: string;
      pattern_type: string;
      pattern_data: Record<string, unknown>;
      confidence_score: string;
      first_observed_at: Date;
      last_observed_at: Date;
      observation_count: number;
      recommendations: string | null;
      next_strategy_focus: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      'SELECT * FROM agent_memory ORDER BY confidence_score DESC',
    );

    return result.rows.map((row) => ({
      id: row.id,
      patternName: row.pattern_name,
      patternType: row.pattern_type,
      patternData: row.pattern_data,
      confidenceScore: parseFloat(row.confidence_score),
      firstObservedAt: row.first_observed_at,
      lastObservedAt: row.last_observed_at,
      observationCount: row.observation_count,
      recommendations: row.recommendations ?? undefined,
      nextStrategyFocus: row.next_strategy_focus ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async upsertPattern(pattern: Pick<AgentMemory, 'patternName' | 'patternType' | 'patternData' | 'confidenceScore' | 'observationCount'>): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO agent_memory
         (pattern_name, pattern_type, pattern_data, confidence_score, observation_count,
          first_observed_at, last_observed_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (pattern_name)
       DO UPDATE SET
         confidence_score   = EXCLUDED.confidence_score,
         observation_count  = agent_memory.observation_count + EXCLUDED.observation_count,
         last_observed_at   = NOW(),
         updated_at         = NOW()`,
      [
        pattern.patternName,
        pattern.patternType,
        JSON.stringify(pattern.patternData),
        pattern.confidenceScore,
        pattern.observationCount,
      ],
    );
  }

  async upsertAll(patterns: Pick<AgentMemory, 'patternName' | 'patternType' | 'patternData' | 'confidenceScore' | 'observationCount'>[]): Promise<void> {
    for (const pattern of patterns) {
      await this.upsertPattern(pattern);
    }
    logger.info(`Upserted ${patterns.length} agent memory patterns`);
  }
}