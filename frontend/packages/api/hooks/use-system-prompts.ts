"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  SystemPrompt,
  SystemPromptCreateRequest,
  SystemPromptUpdateRequest,
} from "../types";

export interface UseSystemPromptsReturn {
  prompts: SystemPrompt[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createPrompt: (data: SystemPromptCreateRequest) => Promise<SystemPrompt | null>;
  updatePrompt: (id: string, data: SystemPromptUpdateRequest) => Promise<SystemPrompt | null>;
  deletePrompt: (id: string) => Promise<boolean>;
  setDefault: (id: string) => Promise<boolean>;
}

export function useSystemPrompts(): UseSystemPromptsReturn {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getClient().listSystemPrompts();
      setPrompts(response.prompts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch prompts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createPrompt = useCallback(
    async (data: SystemPromptCreateRequest): Promise<SystemPrompt | null> => {
      try {
        setError(null);
        const prompt = await getClient().createSystemPrompt(data);
        await refresh();
        return prompt;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create prompt");
        return null;
      }
    },
    [refresh]
  );

  const updatePrompt = useCallback(
    async (id: string, data: SystemPromptUpdateRequest): Promise<SystemPrompt | null> => {
      try {
        setError(null);
        const prompt = await getClient().updateSystemPrompt(id, data);
        await refresh();
        return prompt;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update prompt");
        return null;
      }
    },
    [refresh]
  );

  const deletePrompt = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        setError(null);
        await getClient().deleteSystemPrompt(id);
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete prompt");
        return false;
      }
    },
    [refresh]
  );

  const setDefault = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        setError(null);
        await getClient().updateSystemPrompt(id, { is_default: true });
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to set default");
        return false;
      }
    },
    [refresh]
  );

  return {
    prompts,
    loading,
    error,
    refresh,
    createPrompt,
    updatePrompt,
    deletePrompt,
    setDefault,
  };
}
