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
      className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-5 flex flex-col gap-3 cursor-pointer"
      onClick={() => navigate(`/job/${job.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{job.title}</h3>
          <p className="text-sm text-gray-500 truncate">{job.company}</p>
        </div>
        <CategoryBadge category={analysis.overallCategory} />
      </div>

      {job.location && (
        <p className="text-xs text-gray-400">{job.location}</p>
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Relevance</span>
            <span className="font-medium text-gray-700">{analysis.relevanceScore}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${analysis.relevanceScore}%` }}
            />
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Interview</p>
          <p className="text-sm font-semibold text-blue-600">{analysis.interviewChance}%</p>
        </div>
      </div>

      {analysis.matchedPatterns && analysis.matchedPatterns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {analysis.matchedPatterns.slice(0, 3).map((p) => (
            <span key={p} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
              {p}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-auto pt-1">
        <button
          className="flex-1 text-sm text-center py-1.5 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          onClick={(e) => { e.stopPropagation(); navigate(`/job/${job.id}`); }}
        >
          View Details
        </button>
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-sm text-center py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Apply Now
        </a>
      </div>
    </div>
  );
}
