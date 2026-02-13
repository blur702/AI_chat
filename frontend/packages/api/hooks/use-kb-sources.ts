"use client";

import { useCallback, useState } from "react";
import { getClient } from "../client";
import type { KBSource, KBSearchResult } from "../types";

const MAX_KB_FILE_SIZE = 50 * 1024 * 1024; // 50 MB (matches backend)
const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt", ".md"]);

export interface UseKBSourcesReturn {
  sources: KBSource[];
  sourcesLoading: boolean;
  sourcesError: string | null;
  loadSources: (projectId: string) => Promise<void>;
  uploadSource: (projectId: string, file: File) => Promise<KBSource | null>;
  uploading: boolean;
  deleteSource: (sourceId: string) => Promise<void>;
  deleting: boolean;
  searchResults: KBSearchResult[];
  searchLoading: boolean;
  searchError: string | null;
  search: (projectId: string, query: string, topK?: number) => Promise<void>;
  clearSearch: () => void;
}

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
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
      // Client-side validation
      const ext = getFileExtension(file.name);
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        setSourcesError(`Unsupported file type '${ext}'. Allowed: .pdf, .txt, .md`);
        return null;
      }
      if (file.size > MAX_KB_FILE_SIZE) {
        setSourcesError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 50 MB.`);
        return null;
      }

      setUploading(true);
      setSourcesError(null);
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
    async (sourceId: string) => {
      setDeleting(true);
      setSourcesError(null);
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
