"use client";

import { useState, useCallback, useRef } from "react";
import { getClient } from "../client";
import type { AssembledContextResponse } from "../types";
import { extractErrorMessage } from "../utils/error";

export interface ContextSearchResult {
  layerIndex: number;
  layerName: string;
  lineNumber: number;
  text: string;
}

export interface UseContextEditorReturn {
  assembledContext: AssembledContextResponse | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  searchQuery: string;
  searchResults: ContextSearchResult[];
  fetchContext: (model?: string) => Promise<void>;
  updateCompaction: (compactionId: string, summary: string) => Promise<void>;
  updateInstructions: (instructions: string) => Promise<void>;
  search: (query: string) => void;
  clearSearch: () => void;
}

/**
 * Loads the assembled context layers for a chat and exposes editing and in-memory search.
 * @param chatId - The chat whose assembled context to fetch and edit.
 * @returns Assembled context, search state, and functions to fetch, update compactions, update instructions, and search.
 */
export function useContextEditor(chatId: string): UseContextEditorReturn {
  const [assembledContext, setAssembledContext] = useState<AssembledContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ContextSearchResult[]>([]);
  const modelRef = useRef<string | undefined>();

  const fetchContext = useCallback(async (model?: string) => {
    if (!chatId) return;
    setLoading(true);
    setError(null);
    if (model) modelRef.current = model;
    try {
      const ctx = await getClient().getAssembledContext(chatId, model ?? modelRef.current);
      setAssembledContext(ctx);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to fetch context"));
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  const updateCompaction = useCallback(async (compactionId: string, summary: string) => {
    if (!chatId) return;
    setSaving(true);
    setError(null);
    try {
      await getClient().updateCompactionSummary(chatId, compactionId, summary);
      await fetchContext();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update compaction"));
    } finally {
      setSaving(false);
    }
  }, [chatId, fetchContext]);

  const updateInstructions = useCallback(async (instructions: string) => {
    if (!chatId) return;
    setSaving(true);
    setError(null);
    try {
      await getClient().updateChatInstructions(chatId, instructions);
      await fetchContext();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update instructions"));
    } finally {
      setSaving(false);
    }
  }, [chatId, fetchContext]);

  const search = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !assembledContext) {
      setSearchResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results: ContextSearchResult[] = [];

    assembledContext.layers.forEach((layer, layerIndex) => {
      const lines = layer.content.split("\n");
      lines.forEach((line, lineIdx) => {
        if (line.toLowerCase().includes(lowerQuery)) {
          results.push({
            layerIndex,
            layerName: layer.name,
            lineNumber: lineIdx + 1,
            text: line.trim(),
          });
        }
      });
    });

    setSearchResults(results);
  }, [assembledContext]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  return {
    assembledContext,
    loading,
    saving,
    error,
    searchQuery,
    searchResults,
    fetchContext,
    updateCompaction,
    updateInstructions,
    search,
    clearSearch,
  };
}
