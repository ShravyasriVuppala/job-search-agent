import React, { useEffect, useState } from 'react';
import { getAgentRuns } from '../services/api';
import type { AgentRun } from '../types';

function StatusBadge({ status }: { status: AgentRun['status'] }) {
  const styles = {
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    running: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {status === 'running' && (
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5 animate-pulse" />
      )}
      {status}
    </span>
  );
}

function formatDuration(seconds?: number): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function RunHistory() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAgentRuns().then((data) => {
      setRuns(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agent Run History</h1>
        <p className="text-sm text-gray-500 mt-1">Each row is one scheduled agent run</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">No runs yet</p>
          <p className="text-sm mt-1">Runs are recorded each time <code className="bg-gray-100 px-1 rounded">npm run agent</code> executes</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Started</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Duration</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Fetched</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Analyzed</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Auto-flag</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Maybe</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Skipped</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Patterns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run) => (
                <React.Fragment key={run.id}>
                  <tr className={`hover:bg-gray-50 ${run.status === 'failed' ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(run.startedAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{formatDuration(run.durationSeconds)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium tabular-nums">{run.jobsFetched}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium tabular-nums">{run.jobsAnalyzed}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={run.autoFlagged > 0 ? 'text-green-700 font-semibold' : 'text-gray-400'}>{run.autoFlagged}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={run.maybeFlagged > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400'}>{run.maybeFlagged}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{run.skipped}</td>
                    <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{run.patternsUpserted}</td>
                  </tr>
                  {run.errorMessage && (
                    <tr className="bg-red-50">
                      <td colSpan={9} className="px-4 py-2 text-xs text-red-600 font-mono">
                        {run.errorMessage}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
