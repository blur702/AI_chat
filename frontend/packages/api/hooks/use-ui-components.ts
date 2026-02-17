"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { UIComponentInfo } from "../types";

export interface UseUIComponentsReturn {
  components: UIComponentInfo[];
  categories: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUIComponents(params?: {
  category?: string;
  framework?: string;
  tags?: string[];
}): UseUIComponentsReturn {
  const [components, setComponents] = useState<UIComponentInfo[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const category = params?.category;
  const framework = params?.framework;
  const tagsKey = JSON.stringify(params?.tags ?? []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().listUIComponents({
        category,
        framework,
        tags: params?.tags,
      });
      setComponents(res.components);
      setCategories(res.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load UI components");
    } finally {
      setLoading(false);
    }
  }, [category, framework, tagsKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { components, categories, loading, error, refresh };
}
