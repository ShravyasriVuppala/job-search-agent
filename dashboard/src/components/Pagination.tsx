interface Props {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageCount, onChange }: Props) {
  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-sm text-label">
        Page {page} of {pageCount}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="text-sm font-medium px-3 py-1.5 rounded-control border border-subtle bg-surface text-body hover:bg-surface-2 hover:text-heading disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          className="text-sm font-medium px-3 py-1.5 rounded-control border border-subtle bg-surface text-body hover:bg-surface-2 hover:text-heading disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
