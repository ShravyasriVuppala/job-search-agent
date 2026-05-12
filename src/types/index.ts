export interface Config {
  // Database
  databaseUrl: string;

  // Claude API
  claudeApiKey: string;

  // SendGrid
  sendgridApiKey: string;
  recipientEmail: string;

  // Job APIs
  rapidApiKey: string;

  // Resume
  resumePath: string;
  resumeBase64?: string;

  // Agent behaviour
  nodeEnv: string;
  jobTitles: string[];
  locationPriority: string[];
  yearsExperience: number;
  preferredCompanyStage: string[];
  excludeKeywords: string[];
  preferredTechnicalStack: string[];

  // Schedule
  jobFetchTime: string;
  jobFetchTimezone: string;
  weeklyDigestDay: string;
  weeklyDigestTime: string;
  weeklyDigestTimezone: string;

  // PII Redaction
  enablePiiRedaction: boolean;
  additionalRedactionPatterns: string[];

  // Learning
  agentMemoryRetentionDays: number;
  enablePatternLearning: boolean;
  patternConfidenceThreshold: number;
}

export interface ResumeMetadata {
  id?: string;
  yearsExperience?: number;
  technologies?: string[];
  companies?: string[];
  educationLevel?: string;
  certifications?: string[];
  softSkills?: string[];
  resumeHash: string;
  resumeRedacted: string;
  loadedAt?: Date;
  lastVerifiedAt?: Date;
  isCurrent: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Job {
  id?: string;
  source: string;
  externalId: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  locationCategory?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  applyUrl: string;
  postedAt?: Date;
  fetchedAt?: Date;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OverallCategory = 'auto-flag' | 'needs-review' | 'skip';
export type LocationCategory = 'remote' | 'washington' | 'other';

export interface ClaudeAnalysis {
  id?: string;
  jobId: string;
  relevanceScore: number;
  interviewChance: number;
  locationCategory: LocationCategory;
  overallCategory: OverallCategory;
  relevanceReasoning?: string;
  insights?: string;
  coverLetterDraft?: string;
  matchedPatterns?: string[];
  isStale: boolean;
  staleReason?: string;
  analyzedAt?: Date;
  createdAt?: Date;
}

export interface AgentMemory {
  id?: string;
  patternName: string;
  patternType: string;
  patternData: Record<string, unknown>;
  confidenceScore: number;
  firstObservedAt?: Date;
  lastObservedAt?: Date;
  observationCount: number;
  recommendations?: string;
  nextStrategyFocus?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ApplicationStatus =
  | 'applied'
  | 'interview_scheduled'
  | 'rejected'
  | 'offer'
  | 'archived';

export interface Application {
  id?: string;
  jobId: string;
  claudeAnalysisId?: string;
  appliedAt?: Date;
  status: ApplicationStatus;
  coverLetterUsed?: string;
  userNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}