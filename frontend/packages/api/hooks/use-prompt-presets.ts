"use client";

import { useCallback, useEffect, useState } from "react";
import { getClient } from "../client";
import type {
  PromptPresetCreate,
  PromptPresetListResponse,
  PromptPresetResponse,
  PromptPresetUpdate,
} from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UsePromptPresetsReturn {
  presets: PromptPresetResponse[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  refresh: () => Promise<void>;
  createPreset: (data: PromptPresetCreate) => Promise<PromptPresetResponse | null>;
  updatePreset: (id: string, data: PromptPresetUpdate) => Promise<PromptPresetResponse | null>;
  deletePreset: (id: string) => Promise<void>;
}

/**
 * Fetches and manages prompt presets with optional category, search, and ownership filtering.
 * @param params - Optional filters: `category`, `search` text, and `mineOnly` flag.
 * @returns Preset list, total count, loading/error state, and create/update/delete functions.
 */
export function usePromptPresets(params?: {
  category?: string;
  search?: string;
  mineOnly?: boolean;
}): UsePromptPresetsReturn {
  const [presets, setPresets] = useState<PromptPresetResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result: PromptPresetListResponse = await getClient().listPromptPresets({
        category: params?.category,
        search: params?.search,
        mine_only: params?.mineOnly,
      });
      setPresets(result.presets);
      setTotalCount(result.count);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load presets"));
    } finally {
      setLoading(false);
    }
  }, [params?.category, params?.search, params?.mineOnly]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createPreset = useCallback(
    async (data: PromptPresetCreate): Promise<PromptPresetResponse | null> => {
      setError(null);
      try {
        const created = await getClient().createPromptPreset(data);
        await refresh();
        return created;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to create preset"));
        return null;
      }
    },
    [refresh]
  );

  const updatePreset = useCallback(
    async (id: string, data: PromptPresetUpdate): Promise<PromptPresetResponse | null> => {
      setError(null);
      try {
        const updated = await getClient().updatePromptPreset(id, data);
        await refresh();
        return updated;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to update preset"));
        return null;
      }
    },
    [refresh]
  );

  const deletePreset = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await getClient().deletePromptPreset(id);
        await refresh();
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to delete preset"));
      }
    },
    [refresh]
  );

  return {
    presets,
    loading,
    error,
    totalCount,
    refresh,
    createPreset,
    updatePreset,
    deletePreset,
  };
}
