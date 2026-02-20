"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  HelpFeedbackSubmitResponse,
  HelpSearchResult,
  HelpTopic,
} from "../types/help";
export type { HelpTopic, HelpSearchResult };

export interface UseHelpTopicsReturn {
  topics: HelpTopic[];
  loading: boolean;
  error: string | null;
  search: (query: string) => Promise<HelpSearchResult[]>;
  submitFeedback: (
    topicId: string,
    helpful: boolean,
    contextSlug?: string,
    query?: string,
  ) => Promise<HelpFeedbackSubmitResponse>;
  refresh: () => void;
}

/**
 * Fetches all published help topics and provides semantic search + feedback actions.
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
      setError("Unable to load help topics");
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

  const submitFeedback = useCallback(
    async (
      topicId: string,
      helpful: boolean,
      contextSlug?: string,
      query?: string,
    ): Promise<HelpFeedbackSubmitResponse> => {
      const feedback = await getClient().submitHelpFeedback(topicId, {
        helpful,
        context_slug: contextSlug,
        query,
        source: "help-modal",
      });

      // Keep local topic counts in sync after voting.
      setTopics((prev) =>
        prev.map((topic) =>
          topic.id === topicId
            ? {
                ...topic,
                helpful_count: feedback.helpful_count,
                unhelpful_count: feedback.unhelpful_count,
                total_feedback_count: feedback.total_feedback_count,
                helpful_ratio: feedback.helpful_ratio,
              }
            : topic,
        ),
      );

      return feedback;
    },
    [],
  );

  return { topics, loading, error, search, submitFeedback, refresh: fetchTopics };
}
