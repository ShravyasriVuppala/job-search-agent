import type { Patterns } from '../types';

interface Props {
  patterns: Patterns | null;
  isLoading: boolean;
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-sm text-label">None yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="px-2.5 py-0.5 rounded-pill text-xs font-medium bg-surface-2 text-body">
          {item}
        </span>
      ))}
    </div>
  );
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex items-center justify-between cursor-pointer list-none [&::-webkit-details-marker]:hidden py-1 -mx-1 px-1 rounded-control hover:bg-surface-2 transition-colors">
        <p className="text-sm font-medium text-body">{title}</p>
        <svg
          aria-hidden="true"
          className="w-3.5 h-3.5 text-label transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </summary>
      <div className="mt-2 mb-1">{children}</div>
    </details>
  );
}

export function PatternInsights({ patterns, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-surface rounded-card border border-subtle p-6 animate-pulse">
        <div className="h-5 bg-surface-2 rounded w-1/3 mb-4" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-4">
            <div className="h-3 bg-surface-2 rounded w-1/4 mb-2" />
            <div className="flex gap-2">
              <div className="h-5 bg-surface-2 rounded-full w-16" />
              <div className="h-5 bg-surface-2 rounded-full w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!patterns) {
    return (
      <div className="bg-surface rounded-card border border-subtle p-6 text-label text-sm">
        No pattern data yet. Run the agent loop to generate insights.
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card border border-subtle p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-heading">Agent insights</h2>
        <p className="text-xs text-label mt-0.5">Patterns across everything scanned today.</p>
      </div>

      <div className="space-y-1">
        <CollapsibleSection title="Top skills matched">
          <TagList items={patterns.topSkillsMatched.slice(0, 10)} />
        </CollapsibleSection>

        <CollapsibleSection title="Common gaps">
          <TagList items={patterns.commonGaps.slice(0, 10)} />
        </CollapsibleSection>

        <CollapsibleSection title="Recommended focus">
          <TagList items={patterns.recommendedFocus.slice(0, 10)} />
        </CollapsibleSection>

        <CollapsibleSection title="Best job categories">
          <TagList items={patterns.bestJobCategories.slice(0, 10)} />
        </CollapsibleSection>
      </div>
    </div>
  );
}
