"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getClient } from "../client";
import type {
  OllamaModelInfo,
  RunningModelInfo,
  RemoteModelInfo,
  ModelPullProgress,
} from "../types";
import { extractErrorMessage } from "../utils/error";

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
  loadModel: (name: string) => Promise<boolean>;
  unloadModel: (name: string) => Promise<boolean>;
  pullModel: (name: string) => Promise<boolean>;
  deleteModel: (name: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  isModelRunning: (name: string) => boolean;
  getModelVramMb: (name: string) => number | null;
}

/**
 * Manages Ollama model state including listing local/running/remote models, loading, unloading, pulling, and deletion.
 * Persists the active model selection to `localStorage` and broadcasts changes via a custom DOM event.
 * @returns Model lists, active model, pull progress, action loading state, and model management functions.
 */
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
  const pullResolveRef = useRef<((ok: boolean) => void) | null>(null);
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
      setError(extractErrorMessage(err, "Failed to fetch models"));
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
      pullResolveRef.current?.(false);
      pullResolveRef.current = null;
    };
  }, []);

  const setActiveModel = useCallback((name: string) => {
    setActiveModelState(name);
    try {
      localStorage.setItem(ACTIVE_MODEL_KEY, name);
    } catch (e) {
      console.warn("Failed to persist active model to localStorage:", e);
    }
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
      return true;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load model"));
      return false;
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
      return true;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to unload model"));
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [refresh]);

  const pullModel = useCallback((name: string) => {
    return new Promise<boolean>((resolve) => {
      // Cancel any in-flight pull and resolve it as cancelled.
      pullAbortRef.current?.();
      pullResolveRef.current?.(false);
      pullResolveRef.current = resolve;

      setError(null);
      setPullProgress({ modelName: name, percent: 0, status: "starting" });

      const finish = (ok: boolean) => {
        pullResolveRef.current?.(ok);
        pullResolveRef.current = null;
      };

      const cancel = getClient().pullOllamaModel(
        name,
        (progress: ModelPullProgress) => {
          setPullProgress({
            modelName: name,
            percent: progress.percent ?? 0,
            status: progress.status,
          });
        },
        async () => {
          finish(true);
          setPullProgress(null);
          pullAbortRef.current = null;
          await refresh();
        },
        (errMsg: string) => {
          finish(false);
          setPullProgress(null);
          setError(errMsg);
          pullAbortRef.current = null;
        },
      );

      pullAbortRef.current = cancel;
    });
  }, [refresh]);

  const deleteModel = useCallback(async (name: string) => {
    try {
      setActionLoading(name);
      setError(null);
      await getClient().deleteOllamaModel(name);
      // If the deleted model was active, clear active selection
      if (activeModelRef.current === name) {
        setActiveModelState(null);
        try {
          localStorage.removeItem(ACTIVE_MODEL_KEY);
        } catch (e) {
          console.warn("Failed to remove active model from localStorage:", e);
        }
      }
      await refresh();
      return true;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete model"));
      return false;
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
