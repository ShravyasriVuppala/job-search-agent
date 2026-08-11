import type { SortCol, SortState } from '../utils/jobStatus';

function SortIcon({ col, sort }: { col: SortCol; sort: SortState }) {
  if (sort.col !== col) {
    return <span aria-hidden="true" className="ml-1 text-label select-none">↕</span>;
  }
  return <span aria-hidden="true" className="ml-1 text-accent select-none">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
}

export function SortableTh({ col, label, sort, onSort }: {
  col: SortCol;
  label: string;
  sort: SortState;
  onSort: (col: SortCol) => void;
}) {
  const ariaSort = sort.col === col ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-label uppercase tracking-wide whitespace-nowrap"
      aria-sort={ariaSort}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className="flex items-center select-none hover:text-heading"
      >
        {label}
        <SortIcon col={col} sort={sort} />
      </button>
    </th>
  );
}

export function SkeletonRow({ columns = 6 }: { columns?: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-surface-2 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}
