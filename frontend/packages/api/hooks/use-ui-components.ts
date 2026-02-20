"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { UIComponentInfo } from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseUIComponentsReturn {
  components: UIComponentInfo[];
  categories: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches UI component definitions with optional filtering by category, framework, and tags.
 * @param params - Optional filter parameters for category, framework, and tag strings.
 * @returns Component list, category list, loading/error state, and a `refresh` callback.
 */
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
      setError(extractErrorMessage(err, "Failed to load UI components"));
    } finally {
      setLoading(false);
    }
  }, [category, framework, tagsKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { components, categories, loading, error, refresh };
}
