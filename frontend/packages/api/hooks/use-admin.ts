"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "../client";
import type { KernelMetrics, KernelDebugInfo, ServiceDebugInfo } from "../types";

interface UseAdminReturn {
  metrics: KernelMetrics | null;
  debugInfo: KernelDebugInfo | null;
  loading: boolean;
  error: string | null;
  refreshMetrics: () => Promise<void>;
  refreshDebugInfo: () => Promise<void>;
  getServiceDebug: (serviceName: string) => Promise<ServiceDebugInfo>;
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  autoRefreshInterval: number;
  setAutoRefreshInterval: (ms: number) => void;
  lastUpdated: Date | null;
}

export function useAdmin(): UseAdminReturn {
  const [metrics, setMetrics] = useState<KernelMetrics | null>(null);
  const [debugInfo, setDebugInfo] = useState<KernelDebugInfo | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const loading = metricsLoading || debugLoading;
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(10000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setError(null);
    try {
      const data = await getClient().getKernelMetrics();
      setMetrics(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const refreshDebugInfo = useCallback(async () => {
    setDebugLoading(true);
    setError(null);
    try {
      const data = await getClient().getKernelDebug();
      setDebugInfo(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load debug info");
    } finally {
      setDebugLoading(false);
    }
  }, []);

  const getServiceDebugFn = useCallback(async (serviceName: string) => {
    return getClient().getServiceDebug(serviceName);
  }, []);

  // Initial fetch
  useEffect(() => {
    refreshMetrics();
    refreshDebugInfo();
  }, [refreshMetrics, refreshDebugInfo]);

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefreshEnabled) {
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
