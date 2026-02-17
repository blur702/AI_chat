"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { TechnologyCategoryGroup } from "../types";

export interface UseTechnologiesReturn {
  groups: TechnologyCategoryGroup[];
  categories: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

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
      setError(err instanceof Error ? err.message : "Failed to load technologies");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { groups, categories, loading, error, refresh };
}
