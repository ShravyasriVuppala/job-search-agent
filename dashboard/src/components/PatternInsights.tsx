import type { Patterns } from '../types';

interface Props {
  patterns: Patterns | null;
  isLoading: boolean;
}

function TagList({ items, color }: { items: string[]; color: string }) {
  if (items.length === 0) return <span className="text-sm text-gray-400">None yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function PatternInsights({ patterns, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-4">
            <div className="h-3 bg-gray-100 rounded w-1/4 mb-2" />
            <div className="flex gap-2">
              <div className="h-5 bg-gray-100 rounded-full w-16" />
              <div className="h-5 bg-gray-100 rounded-full w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!patterns) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-gray-400 text-sm">
        No pattern data yet. Run the agent loop to generate insights.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-800">Agent Insights</h2>

      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Top Skills Matched</p>
        <TagList items={patterns.topSkillsMatched} color="bg-blue-50 text-blue-700" />
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Common Gaps</p>
        <TagList items={patterns.commonGaps} color="bg-red-50 text-red-700" />
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Recommended Focus</p>
        <TagList items={patterns.recommendedFocus} color="bg-purple-50 text-purple-700" />
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Best Job Categories</p>
        <TagList items={patterns.bestJobCategories} color="bg-green-50 text-green-700" />
      </div>
    </div>
  );
}
