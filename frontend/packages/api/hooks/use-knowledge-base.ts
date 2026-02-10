"use client";

import { useCallback, useState } from "react";
import { getClient } from "../client";
import type { KBChunk } from "../types";

const PAGE_SIZE = 50;

export interface UseKnowledgeBaseReturn {
  chunks: KBChunk[];
  chunksLoading: boolean;
  totalChunks: number;
  chunksError: string | null;
  getChunks: (sourceId: string, skip?: number, limit?: number) => Promise<void>;
}

export function useKnowledgeBase(): UseKnowledgeBaseReturn {
  const [chunks, setChunks] = useState<KBChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [totalChunks, setTotalChunks] = useState(0);
  const [chunksError, setChunksError] = useState<string | null>(null);

  const getChunks = useCallback(
    async (sourceId: string, skip = 0, limit = PAGE_SIZE) => {
      setChunksLoading(true);
      setChunksError(null);
      try {
        const result = await getClient().getKBChunks(sourceId, skip, limit);
        setChunks(result);
        // Backend returns a flat array; if a full page is returned the source
        // likely has more chunks. We use chunk_count from the source for the
        // true total, but as a fallback estimate: if the result fills the page
        // we signal "there might be more" by adding 1 beyond current offset.
        setTotalChunks(
          result.length < limit ? skip + result.length : skip + limit + 1
        );
      } catch (err) {
        setChunksError(
          err instanceof Error ? err.message : "Failed to load chunks"
        );
        setChunks([]);
        setTotalChunks(0);
      } finally {
        setChunksLoading(false);
      }
    },
    []
  );

  return {
    chunks,
    chunksLoading,
    totalChunks,
    chunksError,
    getChunks,
  };
}
