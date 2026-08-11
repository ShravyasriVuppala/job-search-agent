import { useState, useEffect, useMemo } from 'react';
import type { JobWithAnalysis, Patterns } from '../types';
import { JobList } from '../components/JobList';
import { LocationFilter } from '../components/LocationFilter';
import { PatternInsights } from '../components/PatternInsights';
import { Pagination } from '../components/Pagination';
import { getAllAnalysesFull, getPatterns, getAgentRuns } from '../services/api';

const STALE_THRESHOLD_HOURS = 24;
const SECTION_PAGE_SIZE = 6;

function paginate(items: JobWithAnalysis[], page: number) {
  const start = (page - 1) * SECTION_PAGE_SIZE;
  return items.slice(start, start + SECTION_PAGE_SIZE);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatRelative(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function Dashboard() {
  const [analyses, setAnalyses] = useState<JobWithAnalysis[]>([]);
  const [patterns, setPatterns] = useState<Patterns | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [patternsLoading, setPatternsLoading] = useState(true);
  const [location, setLocation] = useState('all');
  const [staleHours, setStaleHours] = useState<number | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [showApplied, setShowApplied] = useState(false);
  const [autoFlaggedPage, setAutoFlaggedPage] = useState(1);
  const [maybeFlaggedPage, setMaybeFlaggedPage] = useState(1);
  const [needsReviewPage, setNeedsReviewPage] = useState(1);

  useEffect(() => {
    getAllAnalysesFull().then((data) => {
      setAnalyses(data);
      setIsLoading(false);
    });
    getPatterns().then((p) => {
      setPatterns(p);
      setPatternsLoading(false);
    });
    getAgentRuns().then((runs) => {
      const lastSuccess = runs.find((r) => r.status === 'completed');
      if (!lastSuccess) return;
      setLastRunAt(lastSuccess.startedAt);
      const hoursSince = (Date.now() - new Date(lastSuccess.startedAt).getTime()) / 3_600_000;
      if (hoursSince > STALE_THRESHOLD_HOURS) setStaleHours(Math.floor(hoursSince));
    });
  }, []);

  const hiddenCount = useMemo(() => analyses.filter((a) => a.job.isNotInterested).length, [analyses]);
  const appliedCount = useMemo(() => analyses.filter((a) => a.job.isApplied).length, [analyses]);

  const filtered = useMemo(() => {
    return analyses.filter((a) => {
      if (!showHidden && a.job.isNotInterested) return false;
      if (!showApplied && a.job.isApplied) return false;
      if (location !== 'all' && a.job.locationCategory !== location) return false;
      return true;
    });
  }, [analyses, location, showHidden, showApplied]);

  // Filters change which jobs land in each section, so page numbers can go stale — reset to page 1
  // by adjusting state during render (React's recommended pattern) rather than in an effect.
  const [prevFiltered, setPrevFiltered] = useState(filtered);
  if (filtered !== prevFiltered) {
    setPrevFiltered(filtered);
    setAutoFlaggedPage(1);
    setMaybeFlaggedPage(1);
    setNeedsReviewPage(1);
  }

  const autoFlagged = filtered.filter((a) => a.analysis.overallCategory === 'auto-flag');
  const maybeFlagged = filtered.filter((a) => a.analysis.overallCategory === 'maybe-flag');
  const needsReview = filtered.filter((a) => a.analysis.overallCategory === 'needs-review');

  const autoFlaggedPageCount = Math.max(1, Math.ceil(autoFlagged.length / SECTION_PAGE_SIZE));
  const maybeFlaggedPageCount = Math.max(1, Math.ceil(maybeFlagged.length / SECTION_PAGE_SIZE));
  const needsReviewPageCount = Math.max(1, Math.ceil(needsReview.length / SECTION_PAGE_SIZE));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {staleHours !== null && (
        <div role="status" className="flex items-center gap-3 bg-surface-2 border border-subtle rounded-card px-4 py-3 text-sm text-body">
          <svg aria-hidden="true" className="w-4 h-4 shrink-0 text-label" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>Last agent run was <strong className="text-heading">{staleHours} hours ago</strong> — data may be outdated. Check <a href="/runs" className="underline underline-offset-2">Run History</a> for details.</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-light text-heading">{greeting()}</h1>
          <p className="text-sm text-label mt-1.5">
            {isLoading ? 'Loading…' : `${analyses.length} postings analyzed`}
            {lastRunAt && ` · last run ${formatRelative(lastRunAt)}`}
          </p>
        </div>

        <div className="flex gap-3">
          <div className="bg-surface border border-subtle rounded-card px-5 py-3">
            <p className="text-xs text-label">Strong matches</p>
            <p className="text-2xl font-semibold text-accent mt-0.5">{isLoading ? '—' : autoFlagged.length}</p>
          </div>
          <div className="bg-surface border border-subtle rounded-card px-5 py-3">
            <p className="text-xs text-label">Worth a look</p>
            <p className="text-2xl font-semibold text-heading mt-0.5">{isLoading ? '—' : maybeFlagged.length}</p>
          </div>
          <div className="bg-surface border border-subtle rounded-card px-5 py-3">
            <p className="text-xs text-label">Applied</p>
            <p className="text-2xl font-semibold text-heading mt-0.5">{isLoading ? '—' : appliedCount}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <LocationFilter selected={location} onChange={setLocation} />
        <div className="flex items-center gap-2">
          {appliedCount > 0 && (
            <button
              onClick={() => setShowApplied((v) => !v)}
              aria-pressed={showApplied}
              className={`text-xs px-3 py-1.5 rounded-pill border transition-colors ${
                showApplied
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-subtle bg-surface text-body hover:bg-surface-2 hover:text-heading'
              }`}
            >
              {showApplied ? `Hide applied (${appliedCount})` : `Show applied (${appliedCount})`}
            </button>
          )}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden((v) => !v)}
              aria-pressed={showHidden}
              className={`text-xs px-3 py-1.5 rounded-pill border transition-colors ${
                showHidden
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-subtle bg-surface text-body hover:bg-surface-2 hover:text-heading'
              }`}
            >
              {showHidden ? `Hide not-interested (${hiddenCount})` : `Show not-interested (${hiddenCount})`}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
                Strong matches
                {!isLoading && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-pill bg-accent/15 text-xs font-medium text-accent">
                    {autoFlagged.length}
                  </span>
                )}
              </h2>
              <span className="text-xs text-label">Relevance 75% and above</span>
            </div>
            <JobList items={paginate(autoFlagged, autoFlaggedPage)} isLoading={isLoading} emptyMessage="No strong matches yet." />
            <Pagination page={autoFlaggedPage} pageCount={autoFlaggedPageCount} onChange={setAutoFlaggedPage} />
          </section>

          {(isLoading || maybeFlagged.length > 0) && (
            <section>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
                  Worth a look
                  {!isLoading && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-pill bg-surface-2 text-xs font-medium text-label">
                      {maybeFlagged.length}
                    </span>
                  )}
                </h2>
                <span className="text-xs text-label">Lower confidence, still relevant</span>
              </div>
              <JobList items={paginate(maybeFlagged, maybeFlaggedPage)} isLoading={isLoading} emptyMessage="Nothing worth a second look yet." />
              <Pagination page={maybeFlaggedPage} pageCount={maybeFlaggedPageCount} onChange={setMaybeFlaggedPage} />
            </section>
          )}

          {(isLoading || needsReview.length > 0) && (
            <section>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
                  Needs review
                  {!isLoading && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-pill bg-surface-2 text-xs font-medium text-label">
                      {needsReview.length}
                    </span>
                  )}
                </h2>
              </div>
              <JobList items={paginate(needsReview, needsReviewPage)} isLoading={isLoading} emptyMessage="No jobs needing review." />
              <Pagination page={needsReviewPage} pageCount={needsReviewPageCount} onChange={setNeedsReviewPage} />
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
