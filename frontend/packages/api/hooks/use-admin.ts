"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "../client";
import type { KernelMetrics, KernelDebugInfo, ServiceDebugInfo } from "../types";
import { extractErrorMessage } from "../utils/error";

interface UseAdminReturn {
  metrics: KernelMetrics | null;
  debugInfo: KernelDebugInfo | null;
  loading: boolean;
  error: string | null;
  metricsError: string | null;
  debugError: string | null;
  refreshMetrics: () => Promise<void>;
  refreshDebugInfo: () => Promise<void>;
  getServiceDebug: (serviceName: string) => Promise<ServiceDebugInfo>;
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  autoRefreshInterval: number;
  setAutoRefreshInterval: (ms: number) => void;
  lastUpdated: Date | null;
}

/**
 * Fetches kernel metrics and debug info for the admin panel, with optional auto-refresh.
 * @param enabled - When false, skips initial fetch and auto-refresh (useful for non-admin users).
 * @returns Metrics, debug info, loading/error state, refresh callbacks, and auto-refresh controls.
 */
export function useAdmin(enabled = true): UseAdminReturn {
  const [metrics, setMetrics] = useState<KernelMetrics | null>(null);
  const [debugInfo, setDebugInfo] = useState<KernelDebugInfo | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const loading = metricsLoading || debugLoading;
  const error = metricsError || debugError;
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(10000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const data = await getClient().getKernelMetrics();
      setMetrics(data);
      setLastUpdated(new Date());
    } catch (err) {
      setMetricsError(extractErrorMessage(err, "Failed to load metrics"));
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const refreshDebugInfo = useCallback(async () => {
    setDebugLoading(true);
    setDebugError(null);
    try {
      const data = await getClient().getKernelDebug();
      setDebugInfo(data);
      setLastUpdated(new Date());
    } catch (err) {
      setDebugError(extractErrorMessage(err, "Failed to load debug info"));
    } finally {
      setDebugLoading(false);
    }
  }, []);

  const getServiceDebugFn = useCallback(async (serviceName: string) => {
    return getClient().getServiceDebug(serviceName);
  }, []);

  // Initial fetch (only when enabled)
  useEffect(() => {
    if (!enabled) return;
    refreshMetrics();
    refreshDebugInfo();
  }, [enabled, refreshMetrics, refreshDebugInfo]);

  // Auto-refresh (only when enabled)
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (enabled && autoRefreshEnabled) {
      intervalRef.current = setInterval(() => {
        refreshMetrics();
        refreshDebugInfo();
      }, autoRefreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefreshEnabled, autoRefreshInterval, refreshMetrics, refreshDebugInfo]);

  return {
    metrics,
    debugInfo,
    loading,
    error,
    metricsError,
    debugError,
    refreshMetrics,
    refreshDebugInfo,
    getServiceDebug: getServiceDebugFn,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    autoRefreshInterval,
    setAutoRefreshInterval,
    lastUpdated,
  };
}
