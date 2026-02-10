"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { VRAMStats, SystemStats, Resource, ResourceStatusResponse } from "../types";

interface UseResourcesReturn {
  vramStats: VRAMStats | null;
  systemStats: SystemStats | null;
  resources: Resource[];
  fullStatus: ResourceStatusResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useResources(autoRefreshMs?: number): UseResourcesReturn {
  const [vramStats, setVramStats] = useState<VRAMStats | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [fullStatus, setFullStatus] = useState<ResourceStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const status = await getClient().getResourceStatus();
      setFullStatus(status);
      setVramStats(status.vram_stats);
      setSystemStats(status.system_stats);
      setResources(status.loaded_resources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch resources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (autoRefreshMs && autoRefreshMs > 0) {
      const interval = setInterval(refresh, autoRefreshMs);
      return () => clearInterval(interval);
    }
  }, [refresh, autoRefreshMs]);

  return { vramStats, systemStats, resources, fullStatus, loading, error, refresh };
}
