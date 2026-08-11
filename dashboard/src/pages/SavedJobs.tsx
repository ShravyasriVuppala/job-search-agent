import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RawJob } from '../types';
import { getSavedJobs, setJobInteraction } from '../services/api';
import { CategoryBadge } from '../components/CategoryBadge';
import { SortableTh, SkeletonRow } from '../components/JobTableParts';
import { formatDate, statusKey, statusOrder, type SortCol, type SortState } from '../utils/jobStatus';

export function SavedJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<RawJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [sort, setSort] = useState<SortState>({ col: 'postedAt', dir: 'desc' });

  useEffect(() => {
    getSavedJobs(500).then((data) => {
      if (data === null) setError(true);
      else setJobs(data);
      setIsLoading(false);
    });
  }, []);

  const handleInteraction = useCallback(
    async (e: React.MouseEvent, jobId: string, type: 'saved' | 'not_interested', current: boolean) => {
      e.stopPropagation();
      const next = !current;
      if (type === 'saved' && !next) {
        // Unsaving removes the job from this page
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      } else {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? { ...j, isSaved: type === 'saved' ? next : j.isSaved, isNotInterested: type === 'not_interested' ? next : j.isNotInterested }
              : j,
          ),
        );
      }
      await setJobInteraction(jobId, type, next);
    },
    [],
  );

  const locationOptions = useMemo(() => {
    const cats = new Set(jobs.map((j) => j.locationCategory).filter(Boolean) as string[]);
    return ['all', ...Array.from(cats).sort()];
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (locationFilter !== 'all' && j.locationCategory !== locationFilter) return false;
      if (q && !j.company.toLowerCase().includes(q) && !j.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [jobs, search, locationFilter]);

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

  function toggleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' },
    );
  }

  const sharedThProps = { sort, onSort: toggleSort };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Saved Jobs</h1>
          <p className="text-sm text-label mt-1">
            {isLoading ? 'Loading…' : `${sorted.length} of ${jobs.length} saved`}
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

      <div className="flex flex-wrap items-center gap-3">
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
        {(search || locationFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setLocationFilter('all'); }}
            className="text-xs text-accent hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="bg-surface-2 border border-subtle rounded-card px-4 py-3 text-sm text-body">
          Failed to load saved jobs. Make sure the backend is running on port 3001.
        </div>
      )}

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
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
                : sorted.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-label text-sm">
                      {jobs.length === 0 ? 'No saved jobs yet. Save jobs from All Jobs or a job detail page.' : 'No jobs match the current filters.'}
                    </td>
                  </tr>
                )
                : sorted.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => navigate(`/job/${job.id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-heading max-w-[160px] truncate">{job.company}</td>
                    <td className="px-4 py-3 text-sm text-body max-w-[260px]">
                      <span className="line-clamp-2">{job.title}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-label whitespace-nowrap">{job.location ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-label whitespace-nowrap">{formatDate(job.postedAt)}</td>
                    <td className="px-4 py-3"><CategoryBadge category={statusKey(job)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <button
                          onClick={(e) => handleInteraction(e, job.id, 'saved', job.isSaved)}
                          aria-pressed="true"
                          className="text-xs px-2 py-1 rounded-control border border-accent/40 bg-accent/10 text-accent transition-colors"
                        >
                          ✓ Saved
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
      </div>
    </div>
  );
}
