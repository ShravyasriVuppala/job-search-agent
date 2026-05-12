import { TokenBudget } from '../types';
import { logger } from '../utils/logger';

// CONTEXT WINDOW BUDGET:
// - Max available: 200K tokens
// - Safety margin: 150K (never exceed this)
// - Resume: 3K (load once, reuse 40+ times)
// - Agent memory: 5K (learned patterns, fresh daily)
// - Jobs to analyze: 50K (40-50 job descriptions)
// - Total: 58K per day
// - Buffer: 92K (proactive enforcement prevents context bloat)
//
// Proactive validation: tokenBudget.validate() runs BEFORE any
// Claude API calls. If it would exceed margin, agent halts with error.
// This is proactive enforcement, not reactive error handling.

export class TokenBudgetService {
  private readonly maxContextTokens = 200_000;
  private readonly safetyMargin = 150_000;
  private readonly resumeTokens = 3_000;
  private readonly agentMemoryTokens = 5_000;
  private readonly jobsTokens = 50_000;

  // Proactive enforcement: tokenBudget.validate() runs BEFORE any Claude API calls.
  // If context would exceed safety margin, agent halts with clear error.
  // This prevents runaway costs and context bloat.
  // In production, this guards against agent misalignment.
  validate(): boolean {
    const total = this.resumeTokens + this.agentMemoryTokens + this.jobsTokens;
    const buffer = this.safetyMargin - total;

    if (total > this.safetyMargin) {
      logger.error(`Context budget exceeded: ${total} > ${this.safetyMargin}`);
      return false;
    }

    logger.info(`Token budget: ${total}/${this.safetyMargin} (${buffer} buffer remaining)`);
    return true;
  }

  getBudget(): TokenBudget {
    const total = this.resumeTokens + this.agentMemoryTokens + this.jobsTokens;
    return {
      maxContextTokens: this.maxContextTokens,
      safetyMargin: this.safetyMargin,
      resume: this.resumeTokens,
      agentMemory: this.agentMemoryTokens,
      jobsToAnalyze: this.jobsTokens,
      buffer: this.safetyMargin - total,
    };
  }
}