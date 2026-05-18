export interface Job {
  id: string;
  title: string;
  company: string;
  location?: string;
  locationCategory?: string;
  description?: string;
  applyUrl: string;
  source: string;
  recruiterName?: string;
  recruiterEmail?: string;
  companyHiringUrl?: string;
  companySize?: string;
  companyWebsite?: string;
  isSaved?: boolean;
  isNotInterested?: boolean;
  isApplied?: boolean;
}

export interface Analysis {
  id: string;
  relevanceScore: number;
  interviewChance: number;
  overallCategory: string;
  relevanceReasoning?: string;
  insights?: string;
  matchedPatterns?: string[];
  coverLetterDraft?: string;
  analyzedAt?: string;
}

export interface JobWithAnalysis {
  job: Job;
  analysis: Analysis;
}

export interface JobDetail {
  job: Job;
  analysis: Analysis | null;
}

export interface RawJob {
  id: string;
  title: string;
  company: string;
  location?: string;
  locationCategory?: string;
  applyUrl: string;
  source: string;
  postedAt?: string;
  fetchedAt?: string;
  isAnalyzed: boolean;
  relevanceScore?: number;
  interviewChance?: number;
  overallCategory?: string;
  analyzedAt?: string;
  isSaved: boolean;
  isNotInterested: boolean;
}

export interface Patterns {
  topSkillsMatched: string[];
  commonGaps: string[];
  recommendedFocus: string[];
  bestJobCategories: string[];
}

export interface AgentRun {
  id: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
  jobsFetched: number;
  jobsAnalyzed: number;
  autoFlagged: number;
  maybeFlagged: number;
  skipped: number;
  patternsUpserted: number;
  tokensInput: number;
  tokensOutput: number;
  errorMessage?: string;
}

export type ApplicationStatus =
  | 'applied'
  | 'interview_scheduled'
  | 'rejected'
  | 'offer'
  | 'archived';

export interface Application {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  appliedAt: string;
  title?: string;
  company?: string;
  location?: string;
  coverLetterUsed?: string;
  userNotes?: string;
}
