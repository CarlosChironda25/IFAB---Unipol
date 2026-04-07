import { useEffect, useState } from 'react';
import { getSurveyors } from '../api/surveyors';
import type { Surveyor } from '../types/exposure';

interface UseSurveyorsResult {
  surveyors: Surveyor[];
  isLoading: boolean;
  error: string | null;
}

export function useSurveyors(): UseSurveyorsResult {
  const [surveyors, setSurveyors] = useState<Surveyor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchSurveyors = async () => {
      setIsLoading(true);
      try {
        const nextSurveyors = await getSurveyors(controller.signal);
        setSurveyors(nextSurveyors);
        setError(null);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name !== 'AbortError') {
          setError(fetchError.message);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSurveyors();
    return () => controller.abort();
  }, []);

  return { surveyors, isLoading, error };
}
