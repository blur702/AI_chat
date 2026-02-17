"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  HelpTopic,
  HelpTopicCreateRequest,
  HelpTopicUpdateRequest,
} from "../types/help";

export interface UseHelpAdminReturn {
  topics: HelpTopic[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  refresh: () => void;
  createTopic: (data: HelpTopicCreateRequest) => Promise<HelpTopic>;
  updateTopic: (id: string, data: HelpTopicUpdateRequest) => Promise<HelpTopic>;
  deleteTopic: (id: string) => Promise<void>;
}

export function useHelpAdmin(): UseHelpAdminReturn {
  const [topics, setTopics] = useState<HelpTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClient().listHelpTopics();
      setTopics(data.topics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load help topics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const createTopic = useCallback(async (data: HelpTopicCreateRequest) => {
    setSaving(true);
    setError(null);
    try {
      const topic = await getClient().createHelpTopic(data);
      setTopics((prev) => [...prev, topic]);
      return topic;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create help topic");
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const updateTopic = useCallback(async (id: string, data: HelpTopicUpdateRequest) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await getClient().updateHelpTopic(id, data);
      setTopics((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update help topic");
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const deleteTopic = useCallback(async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await getClient().deleteHelpTopic(id);
      setTopics((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete help topic");
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { topics, loading, error, saving, refresh: fetchTopics, createTopic, updateTopic, deleteTopic };
}
