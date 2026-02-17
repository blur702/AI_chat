"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { TechnologyCategoryGroup } from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseTechnologiesReturn {
  groups: TechnologyCategoryGroup[];
  categories: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches available technology definitions grouped by category, with optional category filtering.
 * @param category - Optional category name to filter the results.
 * @returns Technology groups, category list, loading/error state, and a `refresh` callback.
 */
export function useTechnologies(category?: string): UseTechnologiesReturn {
  const [groups, setGroups] = useState<TechnologyCategoryGroup[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().getTechnologies(category);
      setGroups(res.groups);
      setCategories(res.categories);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load technologies"));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { groups, categories, loading, error, refresh };
}
