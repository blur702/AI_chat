"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getClient } from "../client";
import type { EventCreate, EventResponse, EventBroadcastResponse, EventStatsResponse } from "../types";

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

interface UseEventTypesReturn {
  eventTypes: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useEventTypes(): UseEventTypesReturn {
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<{ types: string[]; fetchedAt: number } | null>(null);

  const refresh = useCallback(async () => {
    // Use cache if fetched within the last 60 seconds
    if (cacheRef.current && Date.now() - cacheRef.current.fetchedAt < 60_000) {
      setEventTypes(cacheRef.current.types);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const types = await getClient().getEventTypes();
      cacheRef.current = { types, fetchedAt: Date.now() };
      setEventTypes(types);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch event types");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { eventTypes, loading, error, refresh };
}

interface UseCreateEventReturn {
  createEvent: (data: EventCreate) => Promise<EventResponse | EventBroadcastResponse>;
  creating: boolean;
  error: string | null;
  lastResult: (EventResponse | EventBroadcastResponse) | null;
  clearError: () => void;
}

export function useCreateEvent(): UseCreateEventReturn {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<(EventResponse | EventBroadcastResponse) | null>(null);

  const createEvent = useCallback(async (data: EventCreate): Promise<EventResponse | EventBroadcastResponse> => {
    try {
      setCreating(true);
      setError(null);
      const result = await getClient().createEventBroadcast(data);
      setLastResult(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create event";
      setError(message);
      throw err;
    } finally {
      setCreating(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { createEvent, creating, error, lastResult, clearError };
}

export interface UseEventStatsReturn {
  stats: EventStatsResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useEventStats(): UseEventStatsReturn {
  const [stats, setStats] = useState<EventStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getClient().getEventStats();
      if (!cancelledRef.current) setStats(result);
    } catch (err) {
      if (!cancelledRef.current) setError(err instanceof Error ? err.message : "Failed to fetch event stats");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => { cancelledRef.current = true; };
  }, [refresh]);

  return { stats, loading, error, refresh };
}
