"use client";

import { useCallback, useState } from "react";
import { getClient } from "../client";
import type { KBSource, KBSearchResult } from "../types";

export interface UseKBSourcesReturn {
  sources: KBSource[];
  sourcesLoading: boolean;
  sourcesError: string | null;
  loadSources: (projectId: string) => Promise<void>;
  uploadSource: (projectId: string, file: File) => Promise<KBSource | null>;
  uploading: boolean;
  deleteSource: (sourceId: string, projectId: string) => Promise<void>;
  deleting: boolean;
  searchResults: KBSearchResult[];
  searchLoading: boolean;
  searchError: string | null;
  search: (projectId: string, query: string, topK?: number) => Promise<void>;
  clearSearch: () => void;
}

export function useKBSources(): UseKBSourcesReturn {
  const [sources, setSources] = useState<KBSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchResults, setSearchResults] = useState<KBSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const loadSources = useCallback(async (projectId: string) => {
    setSourcesLoading(true);
    setSourcesError(null);
    try {
      const result = await getClient().listKBSources(projectId);
      setSources(result.sources);
    } catch (err) {
      setSourcesError(err instanceof Error ? err.message : "Failed to load sources");
      setSources([]);
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  const uploadSource = useCallback(
    async (projectId: string, file: File): Promise<KBSource | null> => {
      setUploading(true);
      try {
        const source = await getClient().uploadKBSource(projectId, file);
        setSources((prev) => [source, ...prev]);
        return source;
      } catch (err) {
        setSourcesError(err instanceof Error ? err.message : "Failed to upload");
        return null;
      } finally {
        setUploading(false);
      }
    },
    []
  );

  const deleteSource = useCallback(
    async (sourceId: string, projectId: string) => {
      setDeleting(true);
      try {
        await getClient().deleteKBSource(sourceId);
        setSources((prev) => prev.filter((s) => s.id !== sourceId));
      } catch (err) {
        setSourcesError(err instanceof Error ? err.message : "Failed to delete");
      } finally {
        setDeleting(false);
      }
    },
    []
  );

  const search = useCallback(
    async (projectId: string, query: string, topK = 5) => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const result = await getClient().searchKB({
          project_id: projectId,
          query,
          top_k: topK,
        });
        setSearchResults(result.results);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Search failed");
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    []
  );

  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setSearchError(null);
  }, []);

  return {
    sources,
    sourcesLoading,
    sourcesError,
    loadSources,
    uploadSource,
    uploading,
    deleteSource,
    deleting,
    searchResults,
    searchLoading,
    searchError,
    search,
    clearSearch,
  };
}
