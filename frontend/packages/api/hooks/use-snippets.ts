"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  ContextSnippet,
  ContextSnippetCreateRequest,
  ContextSnippetUpdateRequest,
} from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseSnippetsReturn {
  snippets: ContextSnippet[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createSnippet: (data: ContextSnippetCreateRequest) => Promise<ContextSnippet | null>;
  updateSnippet: (id: string, data: ContextSnippetUpdateRequest) => Promise<ContextSnippet | null>;
  deleteSnippet: (id: string) => Promise<boolean>;
}

/**
 * Fetches and manages reusable context snippets for the authenticated user.
 * @returns Snippet list, loading/error state, and create/update/delete functions.
 */
export function useSnippets(): UseSnippetsReturn {
  const [snippets, setSnippets] = useState<ContextSnippet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getClient().listSnippets();
      setSnippets(response.snippets);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to fetch snippets"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createSnippet = useCallback(
    async (data: ContextSnippetCreateRequest): Promise<ContextSnippet | null> => {
      try {
        setError(null);
        const snippet = await getClient().createSnippet(data);
        await refresh();
        return snippet;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to create snippet"));
        return null;
      }
    },
    [refresh]
  );

  const updateSnippet = useCallback(
    async (id: string, data: ContextSnippetUpdateRequest): Promise<ContextSnippet | null> => {
      try {
        setError(null);
        const snippet = await getClient().updateSnippet(id, data);
        await refresh();
        return snippet;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to update snippet"));
        return null;
      }
    },
    [refresh]
  );

  const deleteSnippet = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        setError(null);
        await getClient().deleteSnippet(id);
        await refresh();
        return true;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to delete snippet"));
        return false;
      }
    },
    [refresh]
  );

  return {
    snippets,
    loading,
    error,
    refresh,
    createSnippet,
    updateSnippet,
    deleteSnippet,
  };
}
