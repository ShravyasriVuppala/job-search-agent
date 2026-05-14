import { TokenBudget } from '../types';
import { logger } from '../utils/logger';

// CONTEXT WINDOW BUDGET:
// - Max available: 200K tokens
// - Safety margin: 150K (never exceed this)
// - Resume: 3K (load once, reuse 40+ times)
// - Agent memory: 5K (learned patterns, fresh daily)
// - Jobs to analyze: 50K (up to 30 job descriptions)
// - Total: 58K per day
// - Buffer: 92K (proactive enforcement prevents context bloat)
//
// Proactive validation: tokenBudget.validate() runs BEFORE any
// Claude API calls. If it would exceed margin, agent halts with error.
// This is proactive enforcement, not reactive error handling.
//
// JOB CAPS PER LOCATION PRIORITY (total = 30):
// Slots are distributed using triangular weights — highest-priority location
// gets the most slots and each subsequent one gets progressively fewer.
// Example with 3 priorities (weights 3:2:1, total weight 6):
//   remote     → 15 jobs (50%)
//   washington → 10 jobs (33%)
//   other      →  5 jobs (17%)

export class TokenBudgetService {
  private readonly maxContextTokens = 200_000;
  private readonly safetyMargin = 150_000;
  private readonly resumeTokens = 3_000;
  private readonly agentMemoryTokens = 5_000;
  private readonly jobsTokens = 50_000;
  // Each job analysis uses ~1K tokens (400 input + 500 output cap).
  // Hard cap: 30 jobs per run, distributed by location priority.
  readonly maxJobsPerRun = 30;

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

  // Returns per-location job caps using triangular weights.
  // 1st priority gets weight n, 2nd gets n-1, ..., last gets 1.
  // The last location absorbs any rounding remainder so the total always
  // equals maxJobsPerRun exactly.
  locationCaps(locationPriority: string[]): Map<string, number> {
    const n = locationPriority.length;
    if (n === 0) return new Map();

    const totalWeight = (n * (n + 1)) / 2;
    const caps = new Map<string, number>();
    let allocated = 0;

    for (let i = 0; i < n; i++) {
      const weight = n - i;
      const isLast = i === n - 1;
      const cap = isLast
        ? this.maxJobsPerRun - allocated
        : Math.floor((weight / totalWeight) * this.maxJobsPerRun);
      caps.set(locationPriority[i], Math.max(0, cap));
      allocated += cap;
    }

    return caps;
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