"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { HelpTopic, HelpSearchResult } from "../types/help";
export type { HelpTopic, HelpSearchResult };

export interface UseHelpTopicsReturn {
  topics: HelpTopic[];
  loading: boolean;
  error: string | null;
  search: (query: string) => Promise<HelpSearchResult[]>;
  refresh: () => void;
}

/**
 * Fetches all published help topics and provides a semantic `search` function.
 * @returns Topic list, loading/error state, a `search` async function, and a `refresh` callback.
 */
export function useHelpTopics(): UseHelpTopicsReturn {
  const [topics, setTopics] = useState<HelpTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClient().listHelpTopics();
      setTopics(data.topics);
    } catch {
      // Silently ignore — help topics are informational and may fail before auth
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const search = useCallback(async (query: string): Promise<HelpSearchResult[]> => {
    const data = await getClient().searchHelpTopics(query);
    return data.results;
  }, []);

  return { topics, loading, error, search, refresh: fetchTopics };
}
