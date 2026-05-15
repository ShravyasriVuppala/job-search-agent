import Anthropic from '@anthropic-ai/sdk';
import {
  Job,
  JobAnalysis,
  JobAnalysisResult,
  CoverLetterResult,
  PatternLearning,
  AnalysisCategory,
} from '../types';
import { logger } from '../utils/logger';

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

export class ClaudeAnalysisService {
  private readonly client: Anthropic;
  private tokensInput = 0;
  private tokensOutput = 0;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  getTokenUsage(): { input: number; output: number } {
    return { input: this.tokensInput, output: this.tokensOutput };
  }

  resetTokenUsage(): void {
    this.tokensInput = 0;
    this.tokensOutput = 0;
  }

  async analyzeJob(
    job: Job,
    resume: string,
    yearsExperience: number,
    preferredStack: string[],
  ): Promise<JobAnalysisResult> {
    const prompt = `Analyze this job posting for a software engineer with ${yearsExperience} years of experience in ${preferredStack.join(', ')}.

RESUME (redacted):
${resume.slice(0, 600)}

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'Not specified'}
Description: ${job.description.slice(0, 1000)}

Respond with ONLY valid JSON (no markdown):
{
  "relevanceScore": <0-100>,
  "interviewChance": <0-100>,
  "overallCategory": "auto-flag" | "maybe-flag" | "skip",
  "relevanceReasoning": "<one sentence>",
  "insights": "<one sentence>",
  "matchedPatterns": ["<pattern>"]
}

Scoring: 75+ = auto-flag, 50-74 = maybe-flag, <50 = skip`;

    const response = await withTimeout(
      this.client.messages.create({
        model: this.model,
        max_tokens: 500,
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

  async generateCoverLetter(
    job: Job,
    analysis: JobAnalysisResult,
    resume: string,
    userName?: string,
  ): Promise<CoverLetterResult> {
    const prompt = `Write a concise cover letter for this job application.

${userName ? `APPLICANT: ${userName}\n` : ''}JOB: ${job.title} at ${job.company}
STRENGTHS: ${analysis.relevanceReasoning}
KEY INSIGHT: ${analysis.insights}

Respond with ONLY valid JSON (no markdown):
{
  "opening": "<one paragraph intro>",
  "body": "<one paragraph highlighting match>",
  "closing": "<one sentence closing>"
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

    return extractJson<CoverLetterResult>(text);
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