import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RawJob } from '../types';
import { getAllJobs } from '../services/api';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_LABEL: Record<string, string> = {
  'auto-flag': 'Auto-flagged',
  'maybe-flag': 'Maybe',
  'needs-review': 'Review',
  skip: 'Skip',
  pending: 'Pending',
};
const STATUS_COLOR: Record<string, string> = {
  'auto-flag': 'bg-green-100 text-green-700',
  'maybe-flag': 'bg-yellow-100 text-yellow-700',
  'needs-review': 'bg-orange-100 text-orange-700',
  skip: 'bg-red-100 text-red-600',
  pending: 'bg-gray-100 text-gray-500',
};
// Lower = higher priority for ascending sort
const STATUS_ORDER: Record<string, number> = {
  'auto-flag': 0,
  'maybe-flag': 1,
  'needs-review': 2,
  pending: 3,
  skip: 4,
};

function statusKey(job: RawJob): string {
  return job.isAnalyzed ? (job.overallCategory ?? 'pending') : 'pending';
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ job }: { job: RawJob }) {
  const key = statusKey(job);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[key] ?? 'bg-gray-100 text-gray-500'}`}>
      {STATUS_LABEL[key] ?? key}
    </span>
  );
}

type SortCol = 'company' | 'title' | 'location' | 'postedAt' | 'status';

function SortIcon({ col, sort }: { col: SortCol; sort: { col: SortCol; dir: 'asc' | 'desc' } }) {
  if (sort.col !== col) {
    return <span className="ml-1 text-gray-300 select-none">↕</span>;
  }
  return <span className="ml-1 text-blue-500 select-none">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
}

function SortableTh({ col, label, sort, onSort }: {
  col: SortCol;
  label: string;
  sort: { col: SortCol; dir: 'asc' | 'desc' };
  onSort: (col: SortCol) => void;
}) {
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800 whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {label}
      <SortIcon col={col} sort={sort} />
    </th>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-100 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function AllJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<RawJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'analyzed' | 'pending'>('all');
  const [locationFilter, setLocationFilter] = useState('all');

  // sort — default: newest first
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'postedAt', dir: 'desc' });

  useEffect(() => {
    getAllJobs(500).then((data) => {
      if (data === null) setError(true);
      else setJobs(data);
      setIsLoading(false);
    });
  }, []);

  // derive unique location categories from loaded data
  const locationOptions = useMemo(() => {
    const cats = new Set(jobs.map((j) => j.locationCategory).filter(Boolean) as string[]);
    return ['all', ...Array.from(cats).sort()];
  }, [jobs]);

  // filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter === 'analyzed' && !j.isAnalyzed) return false;
      if (statusFilter === 'pending' && j.isAnalyzed) return false;
      if (locationFilter !== 'all' && j.locationCategory !== locationFilter) return false;
      if (q && !j.company.toLowerCase().includes(q) && !j.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [jobs, search, statusFilter, locationFilter]);

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
        cmp = (STATUS_ORDER[statusKey(a)] ?? 99) - (STATUS_ORDER[statusKey(b)] ?? 99);
      }
      return cmp * mul;
    });
  }, [filtered, sort]);

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
          <h1 className="text-2xl font-bold text-gray-900">All Fetched Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isLoading ? 'Loading…' : `${sorted.length} of ${jobs.length} jobs`}
          </p>
        </div>
        <input
          type="search"
          placeholder="Search company or title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status pills */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 text-sm">
          {(['all', 'analyzed', 'pending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-md capitalize transition-colors ${
                statusFilter === f
                  ? 'bg-white text-gray-900 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Location dropdown */}
        {locationOptions.length > 1 && (
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 capitalize"
          >
            {locationOptions.map((opt) => (
              <option key={opt} value={opt} className="capitalize">
                {opt === 'all' ? 'All locations' : opt}
              </option>
            ))}
          </select>
        )}

        {/* Clear filters */}
        {(search || statusFilter !== 'all' || locationFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); setLocationFilter('all'); }}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Failed to load jobs. Make sure the backend is running on port 3001.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortableTh col="company"  label="Company"   {...sharedThProps} />
                <SortableTh col="title"    label="Job Title"  {...sharedThProps} />
                <SortableTh col="location" label="Location"  {...sharedThProps} />
                <SortableTh col="postedAt" label="Posted On" {...sharedThProps} />
                <SortableTh col="status"   label="Status"    {...sharedThProps} />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : sorted.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">
                      No jobs match the current filters.
                    </td>
                  </tr>
                )
                : sorted.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/job/${job.id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[160px] truncate">
                      {job.company}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[260px]">
                      <span className="line-clamp-2">{job.title}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {job.location ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(job.postedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge job={job} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="text-sm text-blue-600 hover:underline whitespace-nowrap"
                        onClick={(e) => { e.stopPropagation(); navigate(`/job/${job.id}`); }}
                      >
                        View Details
                      </button>
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
