import { useState, useEffect } from 'react';
import type { Application, ApplicationStatus } from '../types';
import { getApplications, updateApplicationStatus } from '../services/api';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  interview_scheduled: 'Interview',
  rejected: 'Rejected',
  offer: 'Offer',
  archived: 'Archived',
};

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  applied: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  interview_scheduled: 'bg-accent/15 text-accent',
  offer: 'bg-accent/15 text-accent',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  archived: 'bg-surface-2 text-label',
};

const STATUS_OPTIONS: ApplicationStatus[] = [
  'applied',
  'interview_scheduled',
  'rejected',
  'offer',
  'archived',
];

export function Applications() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    getApplications().then((data) => {
      setApplications(data);
      setIsLoading(false);
    });
  }, []);

  async function handleStatusChange(appId: string, jobId: string, status: ApplicationStatus) {
    setUpdating(appId);
    const updated = await updateApplicationStatus(jobId, status);
    if (updated) {
      setApplications((prev) => prev.map((a) => (a.id === appId ? { ...a, status } : a)));
    }
    setUpdating(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-heading">Applications</h1>
        {!isLoading && (
          <span className="text-sm text-label">{applications.length} total</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-card border border-subtle p-4 animate-pulse">
              <div className="h-4 bg-surface-2 rounded w-1/3 mb-2" />
              <div className="h-3 bg-surface-2 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-16 text-label">
          <p className="text-lg">No applications yet.</p>
          <button onClick={() => navigate('/')} className="mt-3 text-accent hover:underline text-sm">
            Browse jobs →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div key={app.id} className="bg-surface rounded-card border border-subtle p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => navigate(`/job/${app.jobId}`)}
                  className="text-sm font-semibold text-heading hover:text-accent truncate block"
                >
                  {app.title ?? 'View job details'}
                </button>
                <p className="text-xs text-body truncate">{app.company ?? '—'}</p>
                <p className="text-xs text-label mt-0.5">
                  Applied {new Date(app.appliedAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-0.5 rounded-pill text-xs font-medium ${STATUS_STYLES[app.status]}`}>
                  {STATUS_LABELS[app.status]}
                </span>

                <select
                  aria-label={`Update status for ${app.title ?? 'this application'}`}
                  value={app.status}
                  disabled={updating === app.id}
                  onChange={(e) => handleStatusChange(app.id, app.jobId, e.target.value as ApplicationStatus)}
                  className="text-xs border border-subtle rounded-control px-2 py-1 bg-surface text-body disabled:opacity-50"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
