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
      const client = getClient();
      const data = await client.get<{ topics: HelpTopic[]; count: number }>("/help");
      setTopics(data.topics);
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
    const client = getClient();
    const data = await client.post<{ results: HelpSearchResult[]; query: string; count: number }>(
      "/help/search",
      { query, top_k: 10 }
    );
    return data.results;
  }, []);

  return { topics, loading, error, search, refresh: fetchTopics };
}
