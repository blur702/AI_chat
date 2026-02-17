"use client";

import { useCallback, useEffect, useState } from "react";
import { getClient } from "../client";
import type {
  SavedPaletteCreateRequest,
  SavedPaletteResponse,
  SavedPaletteUpdateRequest,
} from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UsePalettesReturn {
  palettes: SavedPaletteResponse[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createPalette: (data: SavedPaletteCreateRequest) => Promise<SavedPaletteResponse | null>;
  updatePalette: (id: string, data: SavedPaletteUpdateRequest) => Promise<SavedPaletteResponse | null>;
  deletePalette: (id: string) => Promise<boolean>;
}

/**
 * Fetches and manages saved color palettes, including create, update, and delete operations.
 * @returns Palette list, loading/error state, and CRUD functions for saved palettes.
 */
export function usePalettes(): UsePalettesReturn {
  const [palettes, setPalettes] = useState<SavedPaletteResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().listPalettes();
      setPalettes(res.palettes);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load palettes"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createPalette = useCallback(async (data: SavedPaletteCreateRequest): Promise<SavedPaletteResponse | null> => {
    try {
      setError(null);
      const created = await getClient().createPalette(data);
      await refresh();
      return created;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create palette"));
      return null;
    }
  }, [refresh]);

  const updatePalette = useCallback(async (id: string, data: SavedPaletteUpdateRequest): Promise<SavedPaletteResponse | null> => {
    try {
      setError(null);
      const updated = await getClient().updatePalette(id, data);
      await refresh();
      return updated;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update palette"));
      return null;
    }
  }, [refresh]);

  const deletePalette = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      await getClient().deletePalette(id);
      await refresh();
      return true;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete palette"));
      return false;
    }
  }, [refresh]);

  return {
    palettes,
    loading,
    error,
    refresh,
    createPalette,
    updatePalette,
    deletePalette,
  };
}
