import { useState, useEffect } from 'react';
import type { JobWithAnalysis } from '../types';
import { getAllAnalyses } from '../services/api';

export function useJobs() {
  const [analyses, setAnalyses] = useState<JobWithAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getAllAnalyses(100)
      .then(({ analyses: data }) => {
        if (!cancelled) {
          setAnalyses(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load jobs');
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { analyses, isLoading, error };
}
