import type { JobWithAnalysis } from '../types';
import { JobCard } from './JobCard';

interface Props {
  items: JobWithAnalysis[];
  isLoading: boolean;
  emptyMessage?: string;
}

function Skeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md p-5 animate-pulse flex flex-col gap-3">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-200 rounded w-1/2" />
      <div className="h-2 bg-gray-100 rounded-full" />
      <div className="flex gap-2 pt-1">
        <div className="flex-1 h-8 bg-gray-100 rounded-md" />
        <div className="flex-1 h-8 bg-gray-200 rounded-md" />
      </div>
    </div>
  );
}

export function JobList({ items, isLoading, emptyMessage = 'No jobs found.' }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <JobCard key={item.job.id} item={item} />
      ))}
    </div>
  );
}
