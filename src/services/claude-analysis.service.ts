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

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in Claude response');
  return JSON.parse(match[0]) as T;
}

export class ClaudeAnalysisService {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
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

Scoring: 80+ = auto-flag, 50-79 = maybe-flag, <50 = skip`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return extractJson<CoverLetterResult>(text);
  }

  async learnPatterns(analyses: JobAnalysis[]): Promise<PatternLearning> {
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

    const prompt = `Based on ${analyses.length} job analyses, identify key patterns.

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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return extractJson<PatternLearning>(text);
  }
}