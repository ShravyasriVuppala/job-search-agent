interface Props {
  category: string;
}

const labels: Record<string, string> = {
  'auto-flag': 'Strong match',
  'maybe-flag': 'Worth a look',
  'needs-review': 'Review',
  skip: 'Skip',
  pending: 'Pending',
};

const styles: Record<string, string> = {
  'auto-flag': 'bg-accent/15 text-accent',
  skip: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

export function CategoryBadge({ category }: Props) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-pill text-xs font-medium ${styles[category] ?? 'bg-surface-2 text-label'}`}>
      {labels[category] ?? category}
    </span>
  );
}
