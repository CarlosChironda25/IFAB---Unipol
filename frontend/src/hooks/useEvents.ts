import { useEffect, useRef, useState } from 'react';
import { getEvents } from '../api/events';
import type { DisasterEvent } from '../types/event';

const DEFAULT_POLLING_INTERVAL = 45_000;

interface UseEventsResult {
  events: DisasterEvent[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastUpdated: string | null;
}

export function useEvents(pollingInterval = DEFAULT_POLLING_INTERVAL): UseEventsResult {
  const [events, setEvents] = useState<DisasterEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;

    const fetchEvents = async () => {
      activeController?.abort();
      activeController = new AbortController();

      if (isFirstLoad.current) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const nextEvents = await getEvents(activeController.signal);

        if (!cancelled) {
          setEvents(nextEvents);
          setError(null);
          setLastUpdated(new Date().toISOString());
        }
      } catch (fetchError) {
        if (!cancelled && fetchError instanceof Error && fetchError.name !== 'AbortError') {
          setError(fetchError.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
          isFirstLoad.current = false;
        }
      }
    };

    void fetchEvents();
    const intervalId = window.setInterval(() => {
      void fetchEvents();
    }, pollingInterval);

    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(intervalId);
    };
  }, [pollingInterval]);

  return { events, isLoading, isRefreshing, error, lastUpdated };
}
