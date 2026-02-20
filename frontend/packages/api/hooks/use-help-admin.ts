"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  HelpTopic,
  HelpTopicCreateRequest,
  HelpTopicUpdateRequest,
} from "../types/help";
import { extractErrorMessage } from "../utils/error";

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

/**
 * Manages help topics for the admin panel, including create, update, and delete operations.
 * @returns Topic list, loading/saving/error state, and CRUD functions for help topics.
 */
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
      setError(extractErrorMessage(err, "Failed to load help topics"));
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
      setError(extractErrorMessage(err, "Failed to create help topic"));
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
      setError(extractErrorMessage(err, "Failed to update help topic"));
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
      setError(extractErrorMessage(err, "Failed to delete help topic"));
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { topics, loading, error, saving, refresh: fetchTopics, createTopic, updateTopic, deleteTopic };
}
