"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getClient } from "../client";
import type {
  OllamaModelInfo,
  RunningModelInfo,
  RemoteModelInfo,
  ModelPullProgress,
} from "../types";

export const ACTIVE_MODEL_KEY = "workstation_active_model";
export const ACTIVE_MODEL_CHANGE_EVENT = "active-model-change";

export interface UseModelSwitcherReturn {
  models: OllamaModelInfo[];
  runningModels: RunningModelInfo[];
  remoteModels: RemoteModelInfo[];
  activeModel: string | null;
  loading: boolean;
  actionLoading: string | null;
  pullProgress: { modelName: string; percent: number; status: string } | null;
  error: string | null;
  setActiveModel: (name: string) => void;
  loadModel: (name: string) => Promise<void>;
  unloadModel: (name: string) => Promise<void>;
  pullModel: (name: string) => void;
  deleteModel: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
  isModelRunning: (name: string) => boolean;
  getModelVramMb: (name: string) => number | null;
}

export function useModelSwitcher(): UseModelSwitcherReturn {
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [runningModels, setRunningModels] = useState<RunningModelInfo[]>([]);
  const [remoteModels, setRemoteModels] = useState<RemoteModelInfo[]>([]);
  const [activeModel, setActiveModelState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_MODEL_KEY);
  });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<{
    modelName: string;
    percent: number;
    status: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pullAbortRef = useRef<(() => void) | null>(null);
  const activeModelRef = useRef(activeModel);
  activeModelRef.current = activeModel;

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getClient().listOllamaModels();
      setModels(data.local);
      setRunningModels(data.running);
      setRemoteModels(data.remote);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cleanup pull abort on unmount
  useEffect(() => {
    return () => {
      pullAbortRef.current?.();
    };
  }, []);

  const setActiveModel = useCallback((name: string) => {
    setActiveModelState(name);
    localStorage.setItem(ACTIVE_MODEL_KEY, name);
    // Dispatch custom event for same-window communication
    window.dispatchEvent(new CustomEvent(ACTIVE_MODEL_CHANGE_EVENT, {
      detail: { model: name },
    }));
  }, []);

  const loadModel = useCallback(async (name: string) => {
    try {
      setActionLoading(name);
      setError(null);
      await getClient().loadOllamaModel(name);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load model");
    } finally {
      setActionLoading(null);
    }
  }, [refresh]);

  const unloadModel = useCallback(async (name: string) => {
    try {
      setActionLoading(name);
      setError(null);
      await getClient().unloadOllamaModel(name);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unload model");
    } finally {
      setActionLoading(null);
    }
  }, [refresh]);

  const pullModel = useCallback((name: string) => {
    // Cancel any in-flight pull
    pullAbortRef.current?.();
    setError(null);
    setPullProgress({ modelName: name, percent: 0, status: "starting" });

    const cancel = getClient().pullOllamaModel(
      name,
      (progress: ModelPullProgress) => {
        setPullProgress({
          modelName: name,
          percent: progress.percent ?? 0,
          status: progress.status,
        });
      },
      () => {
        setPullProgress(null);
        pullAbortRef.current = null;
        refresh();
      },
      (errMsg: string) => {
        setPullProgress(null);
        setError(errMsg);
        pullAbortRef.current = null;
      },
    );

    pullAbortRef.current = cancel;
  }, [refresh]);

  const deleteModel = useCallback(async (name: string) => {
    try {
      setActionLoading(name);
      setError(null);
      await getClient().deleteOllamaModel(name);
      // If the deleted model was active, clear active selection
      if (activeModelRef.current === name) {
        setActiveModelState(null);
        localStorage.removeItem(ACTIVE_MODEL_KEY);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete model");
    } finally {
      setActionLoading(null);
    }
  }, [refresh]);

  const isModelRunning = useCallback((name: string) => {
    return runningModels.some((m) => m.name === name);
  }, [runningModels]);

  const getModelVramMb = useCallback((name: string) => {
    const running = runningModels.find((m) => m.name === name);
    if (!running?.size_vram) return null;
    return Math.round(running.size_vram / (1024 * 1024));
  }, [runningModels]);

  return {
    models,
    runningModels,
    remoteModels,
    activeModel,
    loading,
    actionLoading,
    pullProgress,
    error,
    setActiveModel,
    loadModel,
    unloadModel,
    pullModel,
    deleteModel,
    refresh,
    isModelRunning,
    getModelVramMb,
  };
}
