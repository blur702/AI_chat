"use client";

import { useState, useCallback, useMemo } from "react";
import { getClient } from "../client";
import { useModelSwitcher } from "./use-model-switcher";
import { usePolling } from "./use-polling";
import { extractErrorMessage } from "../utils/error";
import type {
  VRAMStats,
  PerGpuStats,
  Resource,
  ResourceStatusResponse,
  SystemStats,
  OffloadDecisionResponse,
  OllamaModelInfo,
  RunningModelInfo,
} from "../types";

export interface UseVramManagementReturn {
  gpus: PerGpuStats[];
  vramStats: VRAMStats | null;
  systemStats: SystemStats | null;
  runningModels: RunningModelInfo[];
  localModels: OllamaModelInfo[];
  offloadedResources: Resource[];
  loadModel: (name: string) => Promise<boolean>;
  unloadModel: (name: string) => Promise<boolean>;
  offloadToRam: (resourceId: string, userId: string) => Promise<OffloadDecisionResponse>;
  reloadFromRam: (resourceId: string, estimatedVramMb: number, userId?: string) => Promise<OffloadDecisionResponse>;
  refresh: () => Promise<void>;
  actionLoading: string | null;
  loading: boolean;
  error: string | null;
}

export function useVramManagement(): UseVramManagementReturn {
  const {
    models,
    runningModels,
    loadModel,
    unloadModel,
    refresh: refreshModels,
    actionLoading: modelActionLoading,
    loading: modelLoading,
    error: modelError,
  } = useModelSwitcher();

  const {
    data: vramData,
    error: vramPollError,
    refresh: refreshVram,
  } = usePolling<VRAMStats>({
    fetcher: () => getClient().getVRAMStats(),
    interval: 5000,
  });

  const {
    data: resourceStatus,
    error: resourcePollError,
    refresh: refreshResourceStatus,
  } = usePolling<ResourceStatusResponse>({
    fetcher: () => getClient().getResourceStatus(),
    interval: 5000,
  });

  const [localActionLoading, setLocalActionLoading] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const gpus = useMemo(() => vramData?.per_gpu ?? [], [vramData]);

  const systemStats = useMemo(
    () => resourceStatus?.system_stats ?? null,
    [resourceStatus],
  );

  const offloadedResources = useMemo(
    () => resourceStatus?.offloaded_resources ?? [],
    [resourceStatus],
  );

  const localModels = useMemo(
    () => models.filter((m) => !runningModels.some((r) => r.name === m.name)),
    [models, runningModels],
  );

  const vramError = vramPollError
    ? extractErrorMessage(vramPollError, "Failed to fetch VRAM stats")
    : null;
  const resourceError = resourcePollError
    ? extractErrorMessage(resourcePollError, "Failed to fetch resource status")
    : null;

  const offloadToRam = useCallback(
    async (resourceId: string, userId: string): Promise<OffloadDecisionResponse> => {
      try {
        setLocalActionLoading(resourceId);
        setLocalError(null);
        const result = await getClient().submitOffloadDecision({
          resource_id: resourceId,
          user_id: userId,
          decision: "offload",
          remember: false,
        });
        await Promise.all([refreshModels(), refreshVram(), refreshResourceStatus()]);
        return result;
      } catch (err) {
        const msg = extractErrorMessage(err, "Failed to offload resource");
        setLocalError(msg);
        throw err;
      } finally {
        setLocalActionLoading(null);
      }
    },
    [refreshModels, refreshVram, refreshResourceStatus],
  );

  const reloadFromRam = useCallback(
    async (resourceId: string, estimatedVramMb: number, userId?: string): Promise<OffloadDecisionResponse> => {
      try {
        setLocalActionLoading(resourceId);
        setLocalError(null);
        const result = await getClient().reloadResource({
          resource_id: resourceId,
          estimated_vram_mb: estimatedVramMb,
          user_id: userId,
        });
        await Promise.all([refreshModels(), refreshVram(), refreshResourceStatus()]);
        return result;
      } catch (err) {
        const msg = extractErrorMessage(err, "Failed to reload resource");
        setLocalError(msg);
        throw err;
      } finally {
        setLocalActionLoading(null);
      }
    },
    [refreshModels, refreshVram, refreshResourceStatus],
  );

  const refresh = useCallback(async () => {
    await Promise.all([refreshModels(), refreshVram(), refreshResourceStatus()]);
  }, [refreshModels, refreshVram, refreshResourceStatus]);

  const actionLoading = modelActionLoading ?? localActionLoading;
  const loading = modelLoading || (vramData === null && vramPollError === null);
  const error = localError ?? modelError ?? vramError ?? resourceError;

  return {
    gpus,
    vramStats: vramData,
    systemStats,
    runningModels,
    localModels,
    offloadedResources,
    loadModel,
    unloadModel,
    offloadToRam,
    reloadFromRam,
    refresh,
    actionLoading,
    loading,
    error,
  };
}
