import { useNavigate } from 'react-router-dom';
import type { JobWithAnalysis } from '../types';
import { CategoryBadge } from './CategoryBadge';

interface Props {
  item: JobWithAnalysis;
}

export function JobCard({ item }: Props) {
  const navigate = useNavigate();
  const { job, analysis } = item;

  return (
    <div
      className="bg-surface rounded-card border border-subtle p-5 flex flex-col gap-3 cursor-pointer transition-colors hover:border-accent/40"
      onClick={() => navigate(`/job/${job.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-heading truncate">{job.title}</h3>
          <p className="text-sm text-body truncate">{job.company}</p>
        </div>
        <CategoryBadge category={analysis.overallCategory} />
      </div>

      {job.location && (
        <p className="text-xs text-label">{job.location}</p>
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-xs text-label mb-1.5">
            <span>Relevance</span>
            <span className="font-semibold text-heading">{analysis.relevanceScore}%</span>
          </div>
          <div className="h-0.5 bg-surface-2 rounded-pill overflow-hidden">
            <div
              className="h-full bg-accent rounded-pill"
              style={{ width: `${analysis.relevanceScore}%` }}
            />
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-label">Interview</p>
          <p className="text-sm font-semibold text-heading">{analysis.interviewChance}%</p>
        </div>
      </div>

      <div className="flex gap-2 mt-auto pt-1">
        <button
          className="flex-1 text-sm text-center py-1.5 rounded-control border border-subtle text-body hover:bg-surface-2 transition-colors"
          onClick={(e) => { e.stopPropagation(); navigate(`/job/${job.id}`); }}
        >
          Details
        </button>
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-sm text-center py-1.5 rounded-control bg-accent text-accent-fg font-medium hover:bg-accent-strong transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Apply<span className="sr-only"> (opens in new tab)</span>
        </a>
      </div>
    </div>
  );
}
