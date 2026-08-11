import type { RawJob } from '../types';

export type SortCol = 'company' | 'title' | 'location' | 'postedAt' | 'status';
export type SortState = { col: SortCol; dir: 'asc' | 'desc' };

// Lower = higher priority for ascending sort
const STATUS_ORDER: Record<string, number> = {
  'auto-flag': 0,
  'maybe-flag': 1,
  'needs-review': 2,
  pending: 3,
  skip: 4,
};

export function statusKey(job: RawJob): string {
  return job.isAnalyzed ? (job.overallCategory ?? 'pending') : 'pending';
}

export function statusOrder(job: RawJob): number {
  return STATUS_ORDER[statusKey(job)] ?? 99;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
