"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getClient } from "../client";
import type { EventResponse } from "../types";

interface UseEventsReturn {
  events: EventResponse[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useEvents(params?: {
  event_type?: string;
  severity?: string;
  source?: string;
  limit?: number;
  offset?: number;
}): UseEventsReturn {
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stableParams = useMemo(
    () => params,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params?.event_type, params?.severity, params?.source, params?.limit, params?.offset]
  );

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getClient().getEvents(stableParams);
      setEvents(result.events);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      setLoading(false);
    }
  }, [stableParams]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { events, total, loading, error, refresh };
}
