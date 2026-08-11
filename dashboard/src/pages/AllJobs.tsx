import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RawJob } from '../types';
import { getAllJobs, setJobInteraction } from '../services/api';
import { Pagination } from '../components/Pagination';
import { CategoryBadge } from '../components/CategoryBadge';
import { SortableTh, SkeletonRow } from '../components/JobTableParts';
import { formatDate, statusKey, statusOrder, type SortCol, type SortState } from '../utils/jobStatus';

const PAGE_SIZE = 10;

export function AllJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<RawJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'analyzed' | 'pending'>('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [showHidden, setShowHidden] = useState(false);

  // sort — default: newest first
  const [sort, setSort] = useState<SortState>({ col: 'postedAt', dir: 'desc' });

  // pagination
  const [page, setPage] = useState(1);

  useEffect(() => {
    getAllJobs(500).then((data) => {
      if (data === null) setError(true);
      else setJobs(data);
      setIsLoading(false);
    });
  }, []);

  const handleInteraction = useCallback(
    async (e: React.MouseEvent, jobId: string, type: 'saved' | 'not_interested', current: boolean) => {
      e.stopPropagation();
      const next = !current;
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, isSaved: type === 'saved' ? next : j.isSaved, isNotInterested: type === 'not_interested' ? next : j.isNotInterested }
            : j,
        ),
      );
      await setJobInteraction(jobId, type, next);
    },
    [],
  );

  // derive unique location categories from loaded data
  const locationOptions = useMemo(() => {
    const cats = new Set(jobs.map((j) => j.locationCategory).filter(Boolean) as string[]);
    return ['all', ...Array.from(cats).sort()];
  }, [jobs]);

  const hiddenCount = useMemo(() => jobs.filter((j) => j.isNotInterested).length, [jobs]);

  // filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (!showHidden && j.isNotInterested) return false;
      if (statusFilter === 'analyzed' && !j.isAnalyzed) return false;
      if (statusFilter === 'pending' && j.isAnalyzed) return false;
      if (locationFilter !== 'all' && j.locationCategory !== locationFilter) return false;
      if (q && !j.company.toLowerCase().includes(q) && !j.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [jobs, search, statusFilter, locationFilter, showHidden]);

  // sort
  const sorted = useMemo(() => {
    const { col, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (col === 'company') cmp = a.company.localeCompare(b.company);
      else if (col === 'title') cmp = a.title.localeCompare(b.title);
      else if (col === 'location') cmp = (a.location ?? '').localeCompare(b.location ?? '');
      else if (col === 'postedAt') {
        const ta = a.postedAt ? new Date(a.postedAt).getTime() : 0;
        const tb = b.postedAt ? new Date(b.postedAt).getTime() : 0;
        cmp = ta - tb;
      } else if (col === 'status') {
        cmp = statusOrder(a) - statusOrder(b);
      }
      return cmp * mul;
    });
  }, [filtered, sort]);

  // Filters/sort change which rows land on which page — reset to page 1 by adjusting
  // state during render (React's recommended pattern) rather than in an effect.
  const [prevSorted, setPrevSorted] = useState(sorted);
  if (sorted !== prevSorted) {
    setPrevSorted(sorted);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    );
  }

  const sharedThProps = { sort, onSort: toggleSort };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">

      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">All fetched jobs</h1>
          <p className="text-sm text-label mt-1">
            {isLoading ? 'Loading…' : `${sorted.length} of ${jobs.length} jobs fetched`}
          </p>
        </div>
        <input
          type="search"
          aria-label="Search company or title"
          placeholder="Search company or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72 px-3 py-2 text-sm bg-surface border border-subtle rounded-control text-heading placeholder-label focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status pills */}
        <div className="flex items-center gap-1 text-sm">
          {(['all', 'analyzed', 'pending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              aria-pressed={statusFilter === f}
              className={`px-3 py-1.5 rounded-pill capitalize transition-colors ${
                statusFilter === f
                  ? 'bg-surface dark:bg-surface-2 text-heading font-medium shadow-sm dark:shadow-none'
                  : 'text-label hover:text-heading'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Location pills */}
        {locationOptions.length > 1 && (
          <div className="flex items-center gap-1 text-sm">
            {locationOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => setLocationFilter(opt)}
                aria-pressed={locationFilter === opt}
                className={`px-3 py-1.5 rounded-pill capitalize transition-colors ${
                  locationFilter === opt
                    ? 'bg-surface dark:bg-surface-2 text-heading font-medium shadow-sm dark:shadow-none'
                    : 'text-label hover:text-heading'
                }`}
              >
                {opt === 'all' ? 'All locations' : opt}
              </button>
            ))}
          </div>
        )}

        {/* Show hidden toggle */}
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
            {showHidden ? `Hide hidden (${hiddenCount})` : `Show hidden (${hiddenCount})`}
          </button>
        )}

        {/* Clear filters */}
        {(search || statusFilter !== 'all' || locationFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); setLocationFilter('all'); }}
            className="text-xs text-accent hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="bg-surface-2 border border-subtle rounded-card px-4 py-3 text-sm text-body">
          Failed to load jobs. Make sure the backend is running on port 3001.
        </div>
      )}

      {/* Table */}
      <div className="bg-surface rounded-card border border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-subtle">
            <thead className="bg-surface-2">
              <tr>
                <SortableTh col="company"  label="Company"   {...sharedThProps} />
                <SortableTh col="title"    label="Job Title"  {...sharedThProps} />
                <SortableTh col="location" label="Location"  {...sharedThProps} />
                <SortableTh col="postedAt" label="Posted On" {...sharedThProps} />
                <SortableTh col="status"   label="Status"    {...sharedThProps} />
                <th className="px-4 py-3 text-left text-xs font-semibold text-label uppercase tracking-wide whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : sorted.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-label text-sm">
                      No jobs match the current filters.
                    </td>
                  </tr>
                )
                : paged.map((job) => (
                  <tr
                    key={job.id}
                    className={`hover:bg-surface-2 transition-colors cursor-pointer ${job.isNotInterested ? 'opacity-50' : ''}`}
                    onClick={() => navigate(`/job/${job.id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-heading max-w-[160px] truncate">
                      {job.company}
                    </td>
                    <td className="px-4 py-3 text-sm text-body max-w-[260px]">
                      <span className="line-clamp-2">{job.title}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-label whitespace-nowrap">
                      {job.location ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-label whitespace-nowrap">
                      {formatDate(job.postedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={statusKey(job)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <button
                          onClick={(e) => handleInteraction(e, job.id, 'saved', job.isSaved)}
                          aria-pressed={job.isSaved}
                          className={`text-xs px-2 py-1 rounded-control border transition-colors ${
                            job.isSaved
                              ? 'border-accent/40 bg-accent/10 text-accent'
                              : 'border-subtle bg-surface text-body hover:bg-surface-2 hover:text-heading'
                          }`}
                        >
                          {job.isSaved ? 'Saved' : 'Save'}
                        </button>
                        <button
                          onClick={(e) => handleInteraction(e, job.id, 'not_interested', job.isNotInterested)}
                          aria-pressed={job.isNotInterested}
                          className={`text-xs px-2 py-1 rounded-control border transition-colors ${
                            job.isNotInterested
                              ? 'border-subtle bg-surface-2 text-body'
                              : 'border-subtle bg-surface text-body hover:bg-surface-2 hover:text-heading'
                          }`}
                        >
                          {job.isNotInterested ? 'Unhide' : 'Hide'}
                        </button>
                        <button
                          className="text-xs text-accent hover:underline"
                          onClick={(e) => { e.stopPropagation(); navigate(`/job/${job.id}`); }}
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        {!isLoading && sorted.length > 0 && (
          <div className="px-4 py-3 border-t border-subtle">
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
