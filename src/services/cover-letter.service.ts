import { ClaudeAnalysisService } from './claude-analysis.service';
import { ClaudeAnalysisQueryRepository, ClaudeAnalysisRepository } from '../db/claude-analysis.repository';
import { ResumeRepository } from '../db/resume.repository';
import { AgentMemoryRepository } from '../db/agent-memory.repository';
import { logger } from '../utils/logger';

// Cover letters are generated on demand rather than during the agent run (most are never used).
// Because generation no longer happens while the run's context is in memory, this service
// rebuilds everything the prompt needs — the job record, its analysis, the redacted résumé, and
// the learned focus patterns — from the database, then persists the result so repeat requests
// are cheap.
export class CoverLetterService {
  private readonly queryRepo = new ClaudeAnalysisQueryRepository();
  private readonly analysisRepo = new ClaudeAnalysisRepository();
  private readonly resumeRepo = new ResumeRepository();
  private readonly memoryRepo = new AgentMemoryRepository();

  constructor(private readonly claudeAnalysisService: ClaudeAnalysisService) {}

  // Returns null if the job has no analysis. Otherwise returns the stored draft if one exists,
  // or generates + persists a new one and returns it. Idempotent per job.
  async getOrCreate(jobId: string): Promise<string | null> {
    const item = await this.queryRepo.getWithJob(jobId);
    if (!item) return null;
    if (item.analysis.coverLetterDraft) return item.analysis.coverLetterDraft;

    const [resumeMeta, memory] = await Promise.all([
      this.resumeRepo.getResumeMetadata(),
      this.memoryRepo.getAll(),
    ]);

    if (!resumeMeta) {
      logger.warn('No résumé in DB — generating cover letter without résumé context', { jobId });
    }

    const focusPatterns = memory
      .filter((m) => m.patternName.startsWith('focus_'))
      .map((m) => m.patternName.replace(/^focus_/, '').replace(/_/g, ' '));

    const cl = await this.claudeAnalysisService.generateCoverLetter(
      {
        title: item.job.title,
        company: item.job.company,
        relevanceReasoning: item.analysis.relevanceReasoning,
        insights: item.analysis.insights,
      },
      resumeMeta?.resumeRedacted ?? '',
      focusPatterns,
    );

    const draft = [cl.opening, cl.body, cl.closing].join('\n\n');
    await this.analysisRepo.updateCoverLetter(jobId, draft);
    return draft;
  }
}
