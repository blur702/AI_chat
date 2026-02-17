"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { TemplateInfo } from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseTemplatesReturn {
  templates: TemplateInfo[];
  categories: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches sandbox project template definitions with optional category filtering.
 * @param category - Optional category name to filter the template list.
 * @returns Template list, category list, loading/error state, and a `refresh` callback.
 */
export function useTemplates(category?: string): UseTemplatesReturn {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().getTemplates(category);
      setTemplates(res.templates);
      setCategories(res.categories);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load templates"));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { templates, categories, loading, error, refresh };
}
