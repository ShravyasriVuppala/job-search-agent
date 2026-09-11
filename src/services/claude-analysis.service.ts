import Anthropic from '@anthropic-ai/sdk';
import {
  Job,
  JobAnalysis,
  JobAnalysisResult,
  CoverLetterResult,
  PatternLearning,
  AnalysisCategory,
  AgentMemory,
} from '../types';
import { logger } from '../utils/logger';

export interface BatchJobResult {
  analysis: JobAnalysisResult;
}

const CALL_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Claude API call timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in Claude response');
  return JSON.parse(match[0]) as T;
}

// Sections that signal fit — keep these and their content.
const KEEP_SECTION = /^(responsibilities|what you.?ll do|what you will do|the role|about the role|role overview|requirements|qualifications|basic qualifications|minimum qualifications|preferred qualifications|what we.?re looking for|who you are|your (role|impact)|the opportunity|tech(nical)? (stack|requirements|skills)|skills|experience|you (will|have|bring)|nice to have|must have)/i;

// Boilerplate that dilutes relevance scoring — drop these sections (usually trailing).
const DROP_SECTION = /^(benefits|perks|what we offer|our benefits|life at|why (you.?ll |)(join|work)|compensation|salary( range)?|pay( range| transparency)?|total rewards|equal (employment )?opportunit|equal opportunity|diversity|inclusion|belonging|we are an equal|eeo|reasonable accommodation|accommodations?|e-?verify|background check|about (us|the company|the team|our)|our (company|team|culture))/i;

// Trim a job description to the parts that signal fit — responsibilities, requirements,
// qualifications, tech stack — dropping trailing boilerplate (benefits, EEO, diversity). Used only
// in the dynamic (uncached) prompt block. Falls back to plain truncation for unstructured text.
export function extractRelevantSections(description: string, maxChars: number): string {
  if (!description) return '';

  const lines = description.split(/\r?\n/);
  const kept: string[] = [];
  let dropping = false;

  for (const raw of lines) {
    const line = raw.trim();
    const looksLikeHeader = line.length > 0 && line.length <= 60;
    // Keep wins over drop, so "About the role" isn't caught by the "About us" rule.
    if (looksLikeHeader && KEEP_SECTION.test(line)) {
      dropping = false;
      kept.push(line);
      continue;
    }
    if (looksLikeHeader && DROP_SECTION.test(line)) {
      dropping = true;
      continue;
    }
    if (!dropping) kept.push(raw);
  }

  const extracted = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // Only fall back to the original if extraction removed almost everything (a mis-fire on
  // unstructured text) — not when a description is legitimately boilerplate-heavy.
  const text = extracted.length < 80 && description.length > 400 ? description : extracted;

  return text.slice(0, maxChars).trim();
}

export class ClaudeAnalysisService {
  private readonly client: Anthropic;
  private tokensInput = 0;
  private tokensOutput = 0;
  private tokensCacheCreation = 0;
  private tokensCacheRead = 0;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly descMaxChars = 3500,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  getTokenUsage(): { input: number; output: number; cacheCreation: number; cacheRead: number } {
    return {
      input: this.tokensInput,
      output: this.tokensOutput,
      cacheCreation: this.tokensCacheCreation,
      cacheRead: this.tokensCacheRead,
    };
  }

  resetTokenUsage(): void {
    this.tokensInput = 0;
    this.tokensOutput = 0;
    this.tokensCacheCreation = 0;
    this.tokensCacheRead = 0;
  }

  async analyzeJob(
    job: Job,
    resume: string,
    yearsExperience: number,
    preferredStack: string[],
    memory: AgentMemory[],
    appliedJobs: { title: string; company: string; location?: string }[],
    userContext?: string,
    strategy?: string,
  ): Promise<JobAnalysisResult> {
    const content = this.buildAnalysisContent(job, resume, yearsExperience, preferredStack, memory, appliedJobs, userContext, strategy);

    const response = await withTimeout(
      this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{ role: 'user', content }],
      }),
      CALL_TIMEOUT_MS,
    );

    this.tokensInput += response.usage.input_tokens;
    this.tokensOutput += response.usage.output_tokens;
    this.tokensCacheCreation += response.usage.cache_creation_input_tokens ?? 0;
    this.tokensCacheRead += response.usage.cache_read_input_tokens ?? 0;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    type RawResult = {
      relevanceScore: number;
      interviewChance: number;
      overallCategory: string;
      relevanceReasoning: string;
      insights: string;
      matchedPatterns: string[];
    };

    const raw = extractJson<RawResult>(text);
    logger.info(`Analyzed job: ${job.title} at ${job.company}`, {
      score: raw.relevanceScore,
      category: raw.overallCategory,
    });

    return {
      relevanceScore: raw.relevanceScore,
      interviewChance: raw.interviewChance,
      overallCategory: raw.overallCategory as AnalysisCategory,
      relevanceReasoning: raw.relevanceReasoning,
      insights: raw.insights,
      matchedPatterns: raw.matchedPatterns ?? [],
    };
  }

  // Generated on demand (Task 3), grounded in the redacted résumé + this job's analysis.
  // The `input` shape is deliberately narrow so callers don't have to reconstruct a full Job.
  async generateCoverLetter(
    input: { title: string; company: string; relevanceReasoning?: string; insights?: string },
    resume: string,
    focusPatterns: string[] = [],
  ): Promise<CoverLetterResult> {
    const focusLine = focusPatterns.length > 0
      ? `\nEMPHASIZE THESE STRENGTHS: ${focusPatterns.slice(0, 5).join(', ')}`
      : '';
    const prompt = `Write a concise, specific cover letter for this job application, grounded in the applicant's actual background. Do not invent experience.

JOB: ${input.title} at ${input.company}
WHY IT FITS: ${input.relevanceReasoning ?? 'N/A'}
KEY INSIGHT: ${input.insights ?? 'N/A'}${focusLine}

APPLICANT RÉSUMÉ (redacted — no PII; draw only on experience shown here):
${resume}

Respond with ONLY valid JSON (no markdown):
{
  "opening": "<one paragraph intro>",
  "body": "<one paragraph tying the applicant's real experience to this role>",
  "closing": "<one sentence closing>"
}`;

    const response = await withTimeout(
      this.client.messages.create({
        model: this.model,
        // A real, detailed résumé pushes a grounded opening+body+closing past 400 tokens
        // (observed: cut off mid-JSON at exactly 400, output_tokens hit the cap). 800 leaves
        // comfortable headroom without materially changing cost.
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
      CALL_TIMEOUT_MS,
    );

    this.tokensInput += response.usage.input_tokens;
    this.tokensOutput += response.usage.output_tokens;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return extractJson<CoverLetterResult>(text);
  }

  async submitAnalysisBatch(
    jobs: Job[],
    resume: string,
    yearsExperience: number,
    preferredStack: string[],
    memory: AgentMemory[],
    appliedJobs: { title: string; company: string; location?: string }[],
    userContext?: string,
    strategy?: string,
  ): Promise<string> {
    const requests = jobs.map((job) => ({
      custom_id: job.id!,
      params: {
        model: this.model,
        max_tokens: 500,
        messages: [{ role: 'user' as const, content: this.buildAnalysisContent(job, resume, yearsExperience, preferredStack, memory, appliedJobs, userContext, strategy) }],
      },
    }));

    const batch = await this.client.beta.messages.batches.create({ requests });
    logger.info('Submitted Anthropic message batch', { batchId: batch.id, jobCount: requests.length });
    return batch.id;
  }

  async checkBatchStatus(batchId: string): Promise<'in_progress' | 'ended'> {
    const batch = await this.client.beta.messages.batches.retrieve(batchId);
    logger.info('Batch status', {
      batchId,
      status: batch.processing_status,
      counts: batch.request_counts,
    });
    return batch.processing_status === 'ended' ? 'ended' : 'in_progress';
  }

  async processBatchResults(batchId: string): Promise<Map<string, BatchJobResult>> {
    const results = new Map<string, BatchJobResult>();

    for await (const item of await this.client.beta.messages.batches.results(batchId)) {
      if (item.result.type !== 'succeeded') {
        logger.warn(`Batch item ${item.custom_id} did not succeed`, { type: item.result.type });
        continue;
      }

      const message = item.result.message;
      this.tokensInput += message.usage.input_tokens;
      this.tokensOutput += message.usage.output_tokens;
      this.tokensCacheCreation += message.usage.cache_creation_input_tokens ?? 0;
      this.tokensCacheRead += message.usage.cache_read_input_tokens ?? 0;

      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      try {
        type RawBatchResult = {
          relevanceScore: number;
          interviewChance: number;
          overallCategory: string;
          relevanceReasoning: string;
          insights: string;
          matchedPatterns: string[];
        };

        const raw = extractJson<RawBatchResult>(text);
        results.set(item.custom_id, {
          analysis: {
            relevanceScore: raw.relevanceScore,
            interviewChance: raw.interviewChance,
            overallCategory: raw.overallCategory as AnalysisCategory,
            relevanceReasoning: raw.relevanceReasoning,
            insights: raw.insights,
            matchedPatterns: raw.matchedPatterns ?? [],
          },
        });
      } catch (err) {
        logger.error(`Failed to parse batch result for job ${item.custom_id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`Processed batch results`, { batchId, parsed: results.size });
    return results;
  }

  // Static block (instructions + resume + patterns + schema) is cached; dynamic block (job details) is not.
  private buildAnalysisContent(
    job: Job,
    resume: string,
    yearsExperience: number,
    preferredStack: string[],
    memory: AgentMemory[],
    appliedJobs: { title: string; company: string; location?: string }[],
    userContext?: string,
    strategy?: string,
  ): Anthropic.TextBlockParam[] {
    const contextSection = userContext
      ? `\nUSER CONTEXT (explicit, highest priority — override any inferences from resume):\n${userContext}\n`
      : '';
    const strategySection = strategy ? `\nTODAY'S STRATEGY:\n${strategy}\n` : '';

    const topPatterns = memory.slice(0, 10);
    const memorySection = topPatterns.length > 0
      ? `\nLEARNED PATTERNS (use to calibrate scoring):\n${topPatterns.map((m) => `- ${m.patternName}: confidence ${m.confidenceScore.toFixed(2)}`).join('\n')}\n`
      : '';

    const appliedSection = appliedJobs.length > 0
      ? `\nPREVIOUSLY APPLIED JOBS (strongest signal — confirmed user intent, weight heavily):\n${appliedJobs.map((j) => `- ${j.title} at ${j.company}${j.location ? ` (${j.location})` : ''}`).join('\n')}\n`
      : '';

    const staticText = `Analyze this job posting for a software engineer with ${yearsExperience} years of experience in ${preferredStack.join(', ')}.${contextSection}${strategySection}${memorySection}${appliedSection}
RESUME (redacted):
${resume}

Respond with ONLY valid JSON (no markdown):
{
  "relevanceScore": <0-100>,
  "interviewChance": <0-100>,
  "overallCategory": "auto-flag" | "maybe-flag" | "skip",
  "relevanceReasoning": "<one sentence>",
  "insights": "<one sentence>",
  "matchedPatterns": ["<pattern>"]
}

Scoring guide:
- 75-100 (auto-flag): Strong match on title, required tech stack, and seniority. User should apply without hesitation.
- 50-74 (maybe-flag): Partial match with gaps worth the user reviewing manually before deciding.
- 0-49 (skip): Poor fit — wrong role type, misaligned tech requirements, or inappropriate seniority level.`;

    const dynamicText = `JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'Not specified'}
Description: ${extractRelevantSections(job.description, this.descMaxChars)}`;

    return [
      { type: 'text', text: staticText, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicText },
    ];
  }

  async learnPatterns(
    analyses: JobAnalysis[],
    appliedJobs: { title: string; company: string; location?: string }[] = [],
  ): Promise<PatternLearning> {
    const autoFlagged = analyses.filter((a) => a.overall_category === 'auto-flag').length;
    const maybeFlagged = analyses.filter((a) => a.overall_category === 'maybe-flag').length;
    const skipped = analyses.filter((a) => a.overall_category === 'skip').length;
    const allPatterns = analyses.flatMap((a) => a.matched_patterns ?? []);
    const topPatterns = [...new Set(allPatterns)].slice(0, 5).join(', ') || 'none yet';
    const topCompanies = analyses
      .filter((a) => a.overall_category !== 'skip')
      .slice(0, 5)
      .map((a) => a.company)
      .join(', ');

    const appliedSection = appliedJobs.length > 0
      ? `\nUSER-APPLIED JOBS (strongest signal — user chose to apply to these):
${appliedJobs.map((j) => `- ${j.title} at ${j.company}${j.location ? ` (${j.location})` : ''}`).join('\n')}
Weight these heavily when identifying patterns — they represent confirmed user intent.\n`
      : '';

    const prompt = `Based on ${analyses.length} job analyses, identify key patterns.
${appliedSection}
RESULTS: auto-flagged=${autoFlagged}, maybe-flagged=${maybeFlagged}, skipped=${skipped}
MATCHED PATTERNS: ${topPatterns}
TOP COMPANIES: ${topCompanies || 'none'}

Respond with ONLY valid JSON (no markdown):
{
  "topSkillsMatched": ["<skill>"],
  "commonGaps": ["<gap>"],
  "recommendedFocus": ["<focus area>"],
  "bestJobCategories": ["<category>"]
}`;

    const response = await withTimeout(
      this.client.messages.create({
        model: this.model,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
      CALL_TIMEOUT_MS,
    );

    this.tokensInput += response.usage.input_tokens;
    this.tokensOutput += response.usage.output_tokens;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return extractJson<PatternLearning>(text);
  }
}