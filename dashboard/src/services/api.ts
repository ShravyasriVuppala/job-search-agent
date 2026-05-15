import type { JobWithAnalysis, JobDetail, RawJob, Patterns, Application, ApplicationStatus, AgentRun } from '../types';

const BASE_URL = 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data ?? json;
  } catch (err) {
    console.error(`API error [${path}]:`, err);
    return null;
  }
}

// Flat JobWithAnalysis shape returned by /jobs/* routes
interface FlatJobWithAnalysis {
  jobId: string;
  title: string;
  company: string;
  location?: string;
  locationCategory?: string;
  applyUrl: string;
  source: string;
  recruiterName?: string;
  recruiterEmail?: string;
  companyHiringUrl?: string;
  companySize?: string;
  companyWebsite?: string;
  relevanceScore: number;
  interviewChance: number;
  overallCategory: string;
  relevanceReasoning?: string;
  insights?: string;
  matchedPatterns?: string[];
  coverLetterDraft?: string;
}

function flatToNested(flat: FlatJobWithAnalysis): JobWithAnalysis {
  return {
    job: {
      id: flat.jobId,
      title: flat.title,
      company: flat.company,
      location: flat.location,
      locationCategory: flat.locationCategory,
      applyUrl: flat.applyUrl,
      source: flat.source,
      recruiterName: flat.recruiterName,
      recruiterEmail: flat.recruiterEmail,
      companyHiringUrl: flat.companyHiringUrl,
      companySize: flat.companySize,
      companyWebsite: flat.companyWebsite,
    },
    analysis: {
      id: flat.jobId,
      relevanceScore: flat.relevanceScore,
      interviewChance: flat.interviewChance,
      overallCategory: flat.overallCategory,
      relevanceReasoning: flat.relevanceReasoning,
      insights: flat.insights,
      matchedPatterns: flat.matchedPatterns,
      coverLetterDraft: flat.coverLetterDraft,
    },
  };
}

export async function getAutoFlaggedJobs(): Promise<JobWithAnalysis[]> {
  const data = await request<{ jobs: FlatJobWithAnalysis[] }>('/jobs/auto-flagged');
  return (data?.jobs ?? []).map(flatToNested);
}

export async function getMaybeFlaggedJobs(): Promise<JobWithAnalysis[]> {
  const data = await request<{ jobs: FlatJobWithAnalysis[] }>('/jobs/maybe-flagged');
  return (data?.jobs ?? []).map(flatToNested);
}

export async function getAllAnalyses(limit = 50, offset = 0): Promise<{ analyses: JobWithAnalysis[]; total: number }> {
  const data = await request<{ analyses: JobWithAnalysis[] }>(`/analyses?limit=${limit}&offset=${offset}`);
  return { analyses: data?.analyses ?? [], total: 0 };
}

export async function getJobDetail(jobId: string): Promise<JobDetail | null> {
  return request<JobDetail>(`/jobs/${jobId}`);
}

export async function getAllJobs(limit = 200): Promise<RawJob[] | null> {
  const data = await request<{ jobs: RawJob[] }>(`/jobs/all?limit=${limit}`);
  if (data === null) return null;
  return data.jobs ?? [];
}

export async function getSavedJobs(limit = 200): Promise<RawJob[] | null> {
  const data = await request<{ jobs: RawJob[] }>(`/jobs/saved?limit=${limit}`);
  if (data === null) return null;
  return data.jobs ?? [];
}

export async function setJobInteraction(
  jobId: string,
  type: 'saved' | 'not_interested',
  active: boolean,
): Promise<boolean> {
  const result = await request<{ success: boolean }>(`/interactions/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, active }),
  });
  return result !== null;
}

export async function getJobsByLocation(category: string): Promise<JobWithAnalysis[]> {
  const data = await request<{ jobs: FlatJobWithAnalysis[] }>(`/jobs/by-location?category=${category}`);
  return (data?.jobs ?? []).map(flatToNested);
}

export async function getPatterns(): Promise<Patterns | null> {
  const data = await request<{ patterns: Patterns }>('/patterns');
  return data?.patterns ?? null;
}

export async function getApplications(): Promise<Application[]> {
  const data = await request<{ applications: Application[] }>('/applications');
  return data?.applications ?? [];
}

export async function recordApplication(jobId: string, coverLetterUsed?: string): Promise<Application | null> {
  return request<Application>('/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, coverLetterUsed }),
  });
}

// Backend route is PATCH /applications/:jobId (not application id — job id)
export async function updateApplicationStatus(jobId: string, status: ApplicationStatus): Promise<Application | null> {
  return request<Application>(`/applications/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export async function getAgentRuns(): Promise<AgentRun[]> {
  const data = await request<{ runs: AgentRun[] }>('/runs');
  return data?.runs ?? [];
}
