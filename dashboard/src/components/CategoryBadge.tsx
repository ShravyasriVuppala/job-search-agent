interface Props {
  category: string;
}

const styles: Record<string, string> = {
  'auto-flag': 'bg-green-100 text-green-800',
  'maybe-flag': 'bg-yellow-100 text-yellow-800',
  'needs-review': 'bg-blue-100 text-blue-800',
  skip: 'bg-gray-100 text-gray-600',
};

const labels: Record<string, string> = {
  'auto-flag': 'Auto-flagged',
  'maybe-flag': 'Maybe',
  'needs-review': 'Review',
  skip: 'Skip',
};

export function CategoryBadge({ category }: Props) {
  const cls = styles[category] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {labels[category] ?? category}
    </span>
  );
}
