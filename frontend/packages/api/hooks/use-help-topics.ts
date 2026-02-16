"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";

export interface HelpTopic {
  id: string;
  slug: string;
  section_id: string;
  title: string;
  body: string;
  tags: string[];
  has_embedding: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface HelpSearchResult {
  id: string;
  slug: string;
  section_id: string;
  title: string;
  body: string;
  tags: string[];
  similarity: number;
}

export interface UseHelpTopicsReturn {
  topics: HelpTopic[];
  loading: boolean;
  error: string | null;
  search: (query: string) => Promise<HelpSearchResult[]>;
  refresh: () => void;
}

export function useHelpTopics(): UseHelpTopicsReturn {
  const [topics, setTopics] = useState<HelpTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClient().listHelpTopics();
      setTopics(data.topics as HelpTopic[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load help topics";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const search = useCallback(async (query: string): Promise<HelpSearchResult[]> => {
    const data = await getClient().searchHelpTopics(query);
    return data.results as HelpSearchResult[];
  }, []);

  return { topics, loading, error, search, refresh: fetchTopics };
}
