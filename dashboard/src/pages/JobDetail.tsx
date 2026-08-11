import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { JobDetail } from '../types';
import { CategoryBadge } from '../components/CategoryBadge';
import { getJobDetail, recordApplication, setJobInteraction } from '../services/api';

export function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<JobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isNotInterested, setIsNotInterested] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    getJobDetail(jobId).then((data) => {
      setItem(data);
      setIsSaved(data?.job.isSaved ?? false);
      setIsNotInterested(data?.job.isNotInterested ?? false);
      setIsLoading(false);
    });
  }, [jobId]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-6 bg-surface-2 rounded w-1/2" />
        <div className="h-4 bg-surface-2 rounded w-1/3" />
        <div className="h-40 bg-surface-2 rounded" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center text-label">
        <p className="text-lg">Job not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-accent hover:underline text-sm">
          ← Back
        </button>
      </div>
    );
  }

  const { job, analysis } = item;

  async function handleApply() {
    if (!job.id) return;
    setApplying(true);
    await recordApplication(job.id, analysis?.coverLetterDraft);
    setApplying(false);
    setApplied(true);
  }

  async function handleToggleSaved() {
    const next = !isSaved;
    setIsSaved(next);
    await setJobInteraction(job.id, 'saved', next);
  }

  async function handleToggleNotInterested() {
    const next = !isNotInterested;
    setIsNotInterested(next);
    await setJobInteraction(job.id, 'not_interested', next);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-accent hover:underline">
        ← Back
      </button>

      {/* Header */}
      <div className="bg-surface rounded-card border border-subtle p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-heading">{job.title}</h1>
            <p className="text-body">{job.company}</p>
          </div>
          {analysis ? (
            <CategoryBadge category={analysis.overallCategory} />
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-pill bg-surface-2 text-label font-medium">
              Not analyzed
            </span>
          )}
        </div>
        {job.location && <p className="text-sm text-label">{job.location}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 bg-accent text-accent-fg text-sm font-medium rounded-control hover:bg-accent-strong transition-colors"
          >
            Apply Now<span className="sr-only"> (opens in new tab)</span>
          </a>
          <button
            onClick={handleApply}
            disabled={applying || applied}
            className="px-5 py-2 border border-subtle bg-surface text-body text-sm rounded-control hover:bg-surface-2 disabled:opacity-50 transition-colors"
          >
            {applied ? 'Marked as Applied ✓' : applying ? 'Saving…' : 'Mark as Applied'}
          </button>
          <button
            onClick={handleToggleSaved}
            aria-pressed={isSaved}
            className={`px-5 py-2 border text-sm rounded-control transition-colors ${
              isSaved
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-subtle bg-surface text-body hover:bg-surface-2'
            }`}
          >
            {isSaved ? '✓ Saved' : 'Save Job'}
          </button>
          <button
            onClick={handleToggleNotInterested}
            aria-pressed={isNotInterested}
            className={`px-5 py-2 border text-sm rounded-control transition-colors ${
              isNotInterested
                ? 'border-red-200 bg-red-100 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                : 'border-subtle bg-surface text-body hover:bg-surface-2'
            }`}
          >
            {isNotInterested ? 'Undo Hide' : 'Not Interested'}
          </button>
        </div>
      </div>

      {/* Job Description */}
      {job.description && (
        <div className="bg-surface rounded-card border border-subtle p-6 space-y-3">
          <h2 className="text-lg font-semibold text-heading">Job Description</h2>
          <div className="text-sm text-body whitespace-pre-wrap leading-relaxed">
            {job.description}
          </div>
        </div>
      )}

      {/* Claude Analysis */}
      {analysis ? (
        <div className="bg-surface rounded-card border border-subtle p-6 space-y-5">
          <h2 className="text-lg font-semibold text-heading">Claude Analysis</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-2 rounded-card p-4 text-center">
              <p className="text-3xl font-semibold text-heading">{analysis.relevanceScore}%</p>
              <p className="text-xs text-label mt-1">Relevance Score</p>
            </div>
            <div className="bg-surface-2 rounded-card p-4 text-center">
              <p className="text-3xl font-semibold text-heading">{analysis.interviewChance}%</p>
              <p className="text-xs text-label mt-1">Interview Chance</p>
            </div>
          </div>

          {analysis.relevanceReasoning && (
            <div>
              <p className="text-xs font-medium text-label uppercase tracking-wide mb-1">Why It Matches</p>
              <p className="text-sm text-body">{analysis.relevanceReasoning}</p>
            </div>
          )}

          {analysis.insights && (
            <div>
              <p className="text-xs font-medium text-label uppercase tracking-wide mb-1">Insights</p>
              <p className="text-sm text-body">{analysis.insights}</p>
            </div>
          )}

          {analysis.matchedPatterns && analysis.matchedPatterns.length > 0 && (
            <div>
              <p className="text-xs font-medium text-label uppercase tracking-wide mb-2">Matched Patterns</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.matchedPatterns.map((p) => (
                  <span key={p} className="px-2.5 py-0.5 rounded-pill text-xs bg-surface-2 text-body">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.coverLetterDraft && (
            <details className="group">
              <summary className="text-sm text-accent hover:underline cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">▸ Show cover letter draft</span>
                <span className="hidden group-open:inline">▾ Hide cover letter draft</span>
              </summary>
              <pre className="mt-3 p-4 bg-surface-2 rounded-card text-sm text-body whitespace-pre-wrap font-sans">
                {analysis.coverLetterDraft}
              </pre>
            </details>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-card border border-subtle p-6 text-center text-label space-y-1">
          <p className="text-sm font-medium">Not yet analyzed</p>
          <p className="text-xs">This job will be scored on the next agent run.</p>
        </div>
      )}

      {/* Recruiter Info */}
      {(job.recruiterName || job.recruiterEmail || job.companySize || job.companyWebsite) && (
        <div className="bg-surface rounded-card border border-subtle p-6 space-y-3">
          <h2 className="text-lg font-semibold text-heading">Recruiter / Company Info</h2>
          <dl className="space-y-2 text-sm">
            {job.recruiterName && (
              <div className="flex gap-2">
                <dt className="text-label w-32 shrink-0">Recruiter</dt>
                <dd className="text-body">{job.recruiterName}</dd>
              </div>
            )}
            {job.recruiterEmail && (
              <div className="flex gap-2">
                <dt className="text-label w-32 shrink-0">Email</dt>
                <dd>
                  <a href={`mailto:${job.recruiterEmail}`} className="text-accent hover:underline">
                    {job.recruiterEmail}
                  </a>
                </dd>
              </div>
            )}
            {job.companySize && (
              <div className="flex gap-2">
                <dt className="text-label w-32 shrink-0">Company Size</dt>
                <dd className="text-body">{job.companySize}</dd>
              </div>
            )}
            {job.companyWebsite && (
              <div className="flex gap-2">
                <dt className="text-label w-32 shrink-0">Website</dt>
                <dd>
                  <a href={job.companyWebsite} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {job.companyWebsite}<span className="sr-only"> (opens in new tab)</span>
                  </a>
                </dd>
              </div>
            )}
            {job.companyHiringUrl && (
              <div className="flex gap-2">
                <dt className="text-label w-32 shrink-0">Hiring Page</dt>
                <dd>
                  <a href={job.companyHiringUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    View careers page<span className="sr-only"> (opens in new tab)</span>
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
