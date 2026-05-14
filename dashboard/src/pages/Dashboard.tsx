import { useState, useEffect } from 'react';
import type { JobWithAnalysis, Patterns } from '../types';
import { JobList } from '../components/JobList';
import { LocationFilter } from '../components/LocationFilter';
import { PatternInsights } from '../components/PatternInsights';
import { getAllAnalyses, getPatterns } from '../services/api';

export function Dashboard() {
  const [analyses, setAnalyses] = useState<JobWithAnalysis[]>([]);
  const [patterns, setPatterns] = useState<Patterns | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [patternsLoading, setPatternsLoading] = useState(true);
  const [location, setLocation] = useState('all');

  useEffect(() => {
    getAllAnalyses(100).then(({ analyses: data }) => {
      setAnalyses(data);
      setIsLoading(false);
    });
    getPatterns().then((p) => {
      setPatterns(p);
      setPatternsLoading(false);
    });
  }, []);

  const filtered = location === 'all'
    ? analyses
    : analyses.filter((a) => a.job.locationCategory === location);

  const autoFlagged = filtered.filter((a) => a.analysis.overallCategory === 'auto-flag');
  const maybeFlagged = filtered.filter((a) => a.analysis.overallCategory === 'maybe-flag');
  const needsReview = filtered.filter((a) => a.analysis.overallCategory === 'needs-review');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isLoading ? 'Loading…' : `${analyses.length} jobs analyzed`}
          </p>
        </div>
        <LocationFilter selected={location} onChange={setLocation} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Auto-flagged
              {!isLoading && (
                <span className="ml-2 text-sm font-normal text-gray-400">({autoFlagged.length})</span>
              )}
            </h2>
            <JobList items={autoFlagged} isLoading={isLoading} emptyMessage="No auto-flagged jobs." />
          </section>

          {(isLoading || maybeFlagged.length > 0) && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Maybe-flagged
                {!isLoading && (
                  <span className="ml-2 text-sm font-normal text-gray-400">({maybeFlagged.length})</span>
                )}
              </h2>
              <JobList items={maybeFlagged} isLoading={isLoading} emptyMessage="No maybe-flagged jobs." />
            </section>
          )}

          {(isLoading || needsReview.length > 0) && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Needs Review
                {!isLoading && (
                  <span className="ml-2 text-sm font-normal text-gray-400">({needsReview.length})</span>
                )}
              </h2>
              <JobList items={needsReview} isLoading={isLoading} emptyMessage="No jobs needing review." />
            </section>
          )}
        </div>

        <aside>
          <PatternInsights patterns={patterns} isLoading={patternsLoading} />
        </aside>
      </div>
    </div>
  );
}
