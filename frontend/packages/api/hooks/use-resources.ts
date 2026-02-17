"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  VRAMStats,
  SystemStats,
  Resource,
  ResourceStatusResponse,
  OffloadDecisionRequest,
  OffloadDecisionResponse,
  ReloadRequest,
  PreemptionCheckResponse,
  PreferenceResponse,
  OffloadPreference,
} from "../types";
import { extractErrorMessage } from "../utils/error";

export type ResourceSortField = "resource_id" | "status" | "vram_mb" | "priority" | "last_used_at";
export type ResourceSortOrder = "asc" | "desc";
export type ResourceStatusFilter = "" | "loaded" | "loading" | "cpu_offloaded" | "error" | "active" | "unloading";

export interface UseResourcesReturn {
  vramStats: VRAMStats | null;
  systemStats: SystemStats | null;
  resources: Resource[];
  fullStatus: ResourceStatusResponse | null;
  loading: boolean;
  error: string | null;
  actionLoading: boolean;
  refresh: () => Promise<void>;
  // Offload / reload
  offloadResource: (data: OffloadDecisionRequest) => Promise<OffloadDecisionResponse>;
  reloadResource: (data: ReloadRequest) => Promise<OffloadDecisionResponse>;
  // Preemption
  checkPreemption: (requiredVramMb: number) => Promise<PreemptionCheckResponse>;
  // Preferences
  preference: OffloadPreference;
  preferenceLoading: boolean;
  fetchPreference: (userId: string) => Promise<void>;
  setPreference: (userId: string, pref: OffloadPreference, remember: boolean) => Promise<void>;
  // Sort / filter
  sortField: ResourceSortField;
  sortOrder: ResourceSortOrder;
  statusFilter: ResourceStatusFilter;
  setSortField: (field: ResourceSortField) => void;
  setSortOrder: (order: ResourceSortOrder) => void;
  setStatusFilter: (filter: ResourceStatusFilter) => void;
  sortedResources: Resource[];
}

function sortResources(
  resources: Resource[],
  field: ResourceSortField,
  order: ResourceSortOrder,
  statusFilter: ResourceStatusFilter,
): Resource[] {
  let filtered = resources;
  if (statusFilter) {
    filtered = resources.filter((r) => r.status === statusFilter);
  }

  return [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "resource_id":
        cmp = a.resource_id.localeCompare(b.resource_id);
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "vram_mb":
        cmp = (a.vram_mb ?? 0) - (b.vram_mb ?? 0);
        break;
      case "priority":
        cmp = a.priority - b.priority;
        break;
      case "last_used_at": {
        const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
        const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
        cmp = ta - tb;
        break;
      }
    }
    return order === "asc" ? cmp : -cmp;
  });
}

/**
 * Fetches GPU resource status, VRAM stats, and loaded resource list with optional auto-refresh.
 * Supports offload/reload actions, preemption checks, user preferences, and sortable/filterable resource views.
 * @param autoRefreshMs - Optional interval in milliseconds for polling the resource status endpoint.
 * @returns VRAM/system stats, resource list, offload/reload actions, preference state, and sort/filter controls.
 */
export function useResources(autoRefreshMs?: number): UseResourcesReturn {
  const [vramStats, setVramStats] = useState<VRAMStats | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [fullStatus, setFullStatus] = useState<ResourceStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preference state
  const [preference, setPreferenceState] = useState<OffloadPreference>("ask_each_time");
  const [preferenceLoading, setPreferenceLoading] = useState(false);

  // Sort / filter state
  const [sortField, setSortField] = useState<ResourceSortField>("priority");
  const [sortOrder, setSortOrder] = useState<ResourceSortOrder>("desc");
  const [statusFilter, setStatusFilter] = useState<ResourceStatusFilter>("");

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const status = await getClient().getResourceStatus();
      setFullStatus(status);
      setVramStats(status.vram_stats);
      setSystemStats(status.system_stats);
      setResources(status.loaded_resources);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to fetch resources"));
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

  const offloadResource = useCallback(
    async (data: OffloadDecisionRequest): Promise<OffloadDecisionResponse> => {
      setActionLoading(true);
      setError(null);
      try {
        const result = await getClient().submitOffloadDecision(data);
        // Optimistic update: mark resource as cpu_offloaded
        if (result.success) {
          setResources((prev) =>
            prev.map((r) =>
              r.resource_id === data.resource_id
                ? { ...r, status: "cpu_offloaded" as const }
                : r
            )
          );
        }
        await refresh();
        return result;
      } catch (err) {
        const msg = extractErrorMessage(err, "Offload failed");
        setError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [refresh]
  );

  const reloadResourceFn = useCallback(
    async (data: ReloadRequest): Promise<OffloadDecisionResponse> => {
      setActionLoading(true);
      setError(null);
      try {
        const result = await getClient().reloadResource(data);
        // Optimistic update: mark resource as loading
        if (result.success) {
          setResources((prev) =>
            prev.map((r) =>
              r.resource_id === data.resource_id
                ? { ...r, status: "loading" as const }
                : r
            )
          );
        }
        await refresh();
        return result;
      } catch (err) {
        const msg = extractErrorMessage(err, "Reload failed");
        setError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [refresh]
  );

  const checkPreemption = useCallback(
    async (requiredVramMb: number): Promise<PreemptionCheckResponse> => {
      setError(null);
      try {
        return await getClient().checkPreemption({ required_vram_mb: requiredVramMb });
      } catch (err) {
        const msg = extractErrorMessage(err, "Preemption check failed");
        setError(msg);
        throw err;
      }
    },
    []
  );

  const fetchPreference = useCallback(async (userId: string) => {
    setPreferenceLoading(true);
    try {
      const resp: PreferenceResponse = await getClient().getPreference(userId);
      setPreferenceState(resp.preference);
    } catch {
      // Default to ask_each_time if fetch fails
      setPreferenceState("ask_each_time");
    } finally {
      setPreferenceLoading(false);
    }
  }, []);

  const setPreferenceFn = useCallback(
    async (userId: string, pref: OffloadPreference, remember: boolean) => {
      setPreferenceLoading(true);
      setError(null);
      // Optimistic
      setPreferenceState(pref);
      try {
        await getClient().setPreference({
          user_id: userId,
          preference: pref,
          remember,
        });
      } catch (err) {
        setPreferenceState("ask_each_time");
        const msg = extractErrorMessage(err, "Failed to save preference");
        setError(msg);
        throw err;
      } finally {
        setPreferenceLoading(false);
      }
    },
    []
  );

  const sortedResources = sortResources(resources, sortField, sortOrder, statusFilter);

  return {
    vramStats,
    systemStats,
    resources,
    fullStatus,
    loading,
    error,
    actionLoading,
    refresh,
    offloadResource,
    reloadResource: reloadResourceFn,
    checkPreemption,
    preference,
    preferenceLoading,
    fetchPreference,
    setPreference: setPreferenceFn,
    sortField,
    sortOrder,
    statusFilter,
    setSortField,
    setSortOrder,
    setStatusFilter,
    sortedResources,
  };
}
