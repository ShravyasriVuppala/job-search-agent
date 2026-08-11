import React, { useEffect, useState } from 'react';
import { getAgentRuns } from '../services/api';
import type { AgentRun } from '../types';

const STATUS_STYLES: Record<AgentRun['status'], string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  running: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300',
};

function StatusBadge({ status }: { status: AgentRun['status'] }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {status === 'running' && (
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5 animate-pulse" />
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
        <h1 className="text-2xl font-bold text-heading">Agent Run History</h1>
        <p className="text-sm text-label mt-1">Each row is one scheduled agent run</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-surface-2 rounded-card animate-pulse" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-20 text-label">
          <p className="text-lg font-medium">No runs yet</p>
          <p className="text-sm mt-1">Runs are recorded each time <code className="bg-surface-2 px-1 rounded">npm run agent</code> executes</p>
        </div>
      ) : (
        <div className="bg-surface rounded-card border border-subtle overflow-hidden">
          <table className="min-w-full divide-y divide-subtle text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-label">Started</th>
                <th className="px-4 py-3 text-left font-semibold text-label">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-label">Duration</th>
                <th className="px-4 py-3 text-right font-semibold text-label">Fetched</th>
                <th className="px-4 py-3 text-right font-semibold text-label">Analyzed</th>
                <th className="px-4 py-3 text-right font-semibold text-label">Auto-flag</th>
                <th className="px-4 py-3 text-right font-semibold text-label">Maybe</th>
                <th className="px-4 py-3 text-right font-semibold text-label">Skipped</th>
                <th className="px-4 py-3 text-right font-semibold text-label">Patterns</th>
                <th className="px-4 py-3 text-right font-semibold text-label">Tokens In</th>
                <th className="px-4 py-3 text-right font-semibold text-label">Tokens Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {runs.map((run) => (
                <React.Fragment key={run.id}>
                  <tr className={`hover:bg-surface-2 ${run.status === 'failed' ? 'bg-red-50/60 dark:bg-red-950/20' : ''}`}>
                    <td className="px-4 py-3 text-body whitespace-nowrap">{formatDate(run.startedAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-4 py-3 text-right text-body tabular-nums">{formatDuration(run.durationSeconds)}</td>
                    <td className="px-4 py-3 text-right text-heading font-medium tabular-nums">{run.jobsFetched}</td>
                    <td className="px-4 py-3 text-right text-heading font-medium tabular-nums">{run.jobsAnalyzed}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={run.autoFlagged > 0 ? 'text-accent font-semibold' : 'text-label'}>{run.autoFlagged}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={run.maybeFlagged > 0 ? 'text-body font-semibold' : 'text-label'}>{run.maybeFlagged}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-label tabular-nums">{run.skipped}</td>
                    <td className="px-4 py-3 text-right text-body tabular-nums">{run.patternsUpserted}</td>
                    <td className="px-4 py-3 text-right text-label tabular-nums">{run.tokensInput > 0 ? run.tokensInput.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-label tabular-nums">{run.tokensOutput > 0 ? run.tokensOutput.toLocaleString() : '—'}</td>
                  </tr>
                  {run.errorMessage && (
                    <tr className="bg-red-50/60 dark:bg-red-950/20">
                      <td colSpan={11} className="px-4 py-2 text-xs text-red-700 dark:text-red-300 font-mono">
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
