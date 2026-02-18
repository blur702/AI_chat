"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface UsePollingOptions<T> {
  /** Function that fetches the data */
  fetcher: () => Promise<T>;
  /** Polling interval in ms */
  interval: number;
  /** Max number of poll attempts (0 = unlimited) */
  maxAttempts?: number;
  /** Overall timeout in ms (0 = no timeout) */
  timeout?: number;
  /** Predicate: return true to stop polling */
  shouldStop?: (data: T) => boolean;
  /** Called when overall timeout is reached */
  onTimeout?: () => void;
  /** Called when a poll attempt errors */
  onError?: (error: unknown) => void;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
}

export interface UsePollingReturn<T> {
  data: T | null;
  isPolling: boolean;
  error: unknown | null;
  isTimedOut: boolean;
  cancel: () => void;
  /** Perform an immediate fetch outside the polling interval. */
  refresh: () => Promise<void>;
}

export function usePolling<T>(options: UsePollingOptions<T>): UsePollingReturn<T> {
  const {
    fetcher,
    interval,
    maxAttempts = 0,
    timeout = 0,
    shouldStop,
    onTimeout,
    onError,
    enabled = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [isTimedOut, setIsTimedOut] = useState(false);

  const cancelledRef = useRef(false);
  const attemptRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const cancel = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    cancelledRef.current = false;
    attemptRef.current = 0;
    setIsPolling(true);
    setIsTimedOut(false);
    setError(null);

    const poll = async () => {
      if (cancelledRef.current) return;

      attemptRef.current++;
      try {
        const result = await fetcher();
        if (cancelledRef.current) return;
        setData(result);
        setError(null);

        if (shouldStop?.(result)) {
          cleanup();
          return;
        }
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err);
        onError?.(err);
      }

      if (maxAttempts > 0 && attemptRef.current >= maxAttempts) {
        cleanup();
      }
    };

    // Initial poll
    poll();

    // Set up interval
    intervalRef.current = setInterval(poll, interval);

    // Set up overall timeout
    if (timeout > 0) {
      timeoutRef.current = setTimeout(() => {
        setIsTimedOut(true);
        onTimeout?.();
        cleanup();
      }, timeout);
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, interval]);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
      onError?.(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, isPolling, error, isTimedOut, cancel, refresh };
}
