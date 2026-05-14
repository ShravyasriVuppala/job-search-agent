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

export interface Patterns {
  topSkillsMatched: string[];
  commonGaps: string[];
  recommendedFocus: string[];
  bestJobCategories: string[];
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
  coverLetterUsed?: string;
  userNotes?: string;
}
