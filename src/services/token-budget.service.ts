import { Job, AgentMemory } from '../types';
import { logger } from '../utils/logger';

// ~4 characters per token is a reliable approximation for English text.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

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
  // Each job analysis uses ~1K tokens (400 input + 500 output cap).
  // Hard cap: 30 jobs per run, distributed by location priority.
  readonly maxJobsPerRun = 30;

  // Validates token budget using real runtime data — called after jobs are selected,
  // immediately before the first Claude API call in analyzeJobs.
  // Uses ~4 chars/token approximation (reliable for English text).
  validateForAnalysis(resumeText: string, memory: AgentMemory[], jobs: Job[]): boolean {
    const resumeTokens = estimateTokens(resumeText);
    const memoryTokens = estimateTokens(memory.map((m) => `${m.patternName}: ${m.confidenceScore}`).join('\n'));
    const jobsTokens = jobs.reduce((sum, j) => sum + estimateTokens(j.title + j.description + (j.location ?? '')), 0);
    const total = resumeTokens + memoryTokens + jobsTokens;
    const buffer = this.safetyMargin - total;

    if (total > this.safetyMargin) {
      logger.error('Token budget exceeded — aborting before Claude API calls', {
        resumeTokens, memoryTokens, jobsTokens, total, limit: this.safetyMargin,
      });
      return false;
    }

    logger.info('Token budget validated', { resumeTokens, memoryTokens, jobsTokens, total, buffer });
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

}
