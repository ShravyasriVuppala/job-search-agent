import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { JobDetail } from '../types';
import { CategoryBadge } from '../components/CategoryBadge';
import { getJobDetail, recordApplication } from '../services/api';

export function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<JobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [coverOpen, setCoverOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    getJobDetail(jobId).then((data) => {
      setItem(data);
      setIsLoading(false);
    });
  }, [jobId]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-100 rounded w-1/3" />
        <div className="h-40 bg-gray-100 rounded" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center text-gray-400">
        <p className="text-lg">Job not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-blue-600 hover:underline text-sm">
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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">
        ← Back
      </button>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
            <p className="text-gray-500">{job.company}</p>
          </div>
          {analysis ? (
            <CategoryBadge category={analysis.overallCategory} />
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
              Not analyzed
            </span>
          )}
        </div>
        {job.location && <p className="text-sm text-gray-400">{job.location}</p>}

        <div className="flex gap-3 pt-2">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            Apply Now
          </a>
          <button
            onClick={handleApply}
            disabled={applying || applied}
            className="px-5 py-2 border border-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {applied ? 'Marked as Applied ✓' : applying ? 'Saving…' : 'Mark as Applied'}
          </button>
        </div>
      </div>

      {/* Job Description */}
      {job.description && (
        <div className="bg-white rounded-lg shadow-md p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Job Description</h2>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {job.description}
          </div>
        </div>
      )}

      {/* Claude Analysis */}
      {analysis ? (
        <div className="bg-white rounded-lg shadow-md p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-800">Claude Analysis</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-blue-700">{analysis.relevanceScore}%</p>
              <p className="text-xs text-blue-500 mt-1">Relevance Score</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-purple-700">{analysis.interviewChance}%</p>
              <p className="text-xs text-purple-500 mt-1">Interview Chance</p>
            </div>
          </div>

          {analysis.relevanceReasoning && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Why It Matches</p>
              <p className="text-sm text-gray-700">{analysis.relevanceReasoning}</p>
            </div>
          )}

          {analysis.insights && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Insights</p>
              <p className="text-sm text-gray-700">{analysis.insights}</p>
            </div>
          )}

          {analysis.matchedPatterns && analysis.matchedPatterns.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Matched Patterns</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.matchedPatterns.map((p) => (
                  <span key={p} className="px-2.5 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.coverLetterDraft && (
            <div>
              <button
                onClick={() => setCoverOpen(!coverOpen)}
                className="text-sm text-blue-600 hover:underline"
              >
                {coverOpen ? '▾ Hide cover letter draft' : '▸ Show cover letter draft'}
              </button>
              {coverOpen && (
                <pre className="mt-3 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap font-sans">
                  {analysis.coverLetterDraft}
                </pre>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-400 space-y-1">
          <p className="text-sm font-medium">Not yet analyzed</p>
          <p className="text-xs">This job will be scored on the next agent run.</p>
        </div>
      )}

      {/* Recruiter Info */}
      {(job.recruiterName || job.recruiterEmail || job.companySize || job.companyWebsite) && (
        <div className="bg-white rounded-lg shadow-md p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Recruiter / Company Info</h2>
          <dl className="space-y-2 text-sm">
            {job.recruiterName && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32 shrink-0">Recruiter</dt>
                <dd className="text-gray-700">{job.recruiterName}</dd>
              </div>
            )}
            {job.recruiterEmail && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32 shrink-0">Email</dt>
                <dd>
                  <a href={`mailto:${job.recruiterEmail}`} className="text-blue-600 hover:underline">
                    {job.recruiterEmail}
                  </a>
                </dd>
              </div>
            )}
            {job.companySize && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32 shrink-0">Company Size</dt>
                <dd className="text-gray-700">{job.companySize}</dd>
              </div>
            )}
            {job.companyWebsite && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32 shrink-0">Website</dt>
                <dd>
                  <a href={job.companyWebsite} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {job.companyWebsite}
                  </a>
                </dd>
              </div>
            )}
            {job.companyHiringUrl && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32 shrink-0">Hiring Page</dt>
                <dd>
                  <a href={job.companyHiringUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    View careers page
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
