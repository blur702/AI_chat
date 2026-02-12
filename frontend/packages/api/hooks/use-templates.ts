"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { TemplateInfo } from "../types";

export interface UseTemplatesReturn {
  templates: TemplateInfo[];
  categories: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

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
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { templates, categories, loading, error, refresh };
}
