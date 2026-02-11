"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "../client";
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "../types";

export interface UseImageGenerationReturn {
  generations: ImageGenerationResponse[];
  currentGeneration: ImageGenerationResponse | null;
  generating: boolean;
  loading: boolean;
  error: string | null;
  totalCount: number;
  currentPage: number;
  filterStatus: ImageGenerationStatus | "all";
  refresh: () => Promise<void>;
  generate: (params: ImageGenerationRequest) => Promise<ImageGenerationResponse | null>;
  cancelGeneration: () => void;
  deleteGeneration: (jobId: string) => Promise<void>;
  bulkDelete: (jobIds: string[]) => Promise<void>;
  downloadImage: (jobId: string, filename: string) => Promise<void>;
  setPage: (page: number) => Promise<void>;
  setFilter: (status: ImageGenerationStatus | "all") => Promise<void>;
}

const POLL_INTERVAL_MS = 2000;
const PAGE_SIZE = 20;

export function useImageGeneration(
  projectId: string | null
): UseImageGenerationReturn {
  const [generations, setGenerations] = useState<ImageGenerationResponse[]>([]);
  const [currentGeneration, setCurrentGeneration] =
    useState<ImageGenerationResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<ImageGenerationStatus | "all">(
    "all"
  );

  const currentPageRef = useRef(currentPage);
  const filterStatusRef = useRef(filterStatus);
  currentPageRef.current = currentPage;
  filterStatusRef.current = filterStatus;

  const listPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStatusPolling = useCallback(() => {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  const stopListPolling = useCallback(() => {
    if (listPollRef.current) {
      clearInterval(listPollRef.current);
      listPollRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);
    try {
      const skip = (currentPageRef.current - 1) * PAGE_SIZE;
      const statusParam = filterStatusRef.current === "all" ? undefined : filterStatusRef.current;
      const response = await getClient().listGenerations(projectId, skip, PAGE_SIZE, statusParam);
      setGenerations(response.generations);
      setTotalCount(response.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load generations");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const pollGenerationStatus = useCallback(
    (jobId: string) => {
      stopStatusPolling();
      statusPollRef.current = setInterval(async () => {
        try {
          const status = await getClient().getGenerationStatus(jobId);
          setCurrentGeneration(status);

          if (status.status === "completed") {
            setGenerating(false);
            stopStatusPolling();
            await refresh();
            return;
          }

          if (status.status === "failed") {
            setGenerating(false);
            setError(status.error_message ?? "Image generation failed");
            stopStatusPolling();
            await refresh();
          }
        } catch (err) {
          setGenerating(false);
          setError(
            err instanceof Error ? err.message : "Failed to poll generation status"
          );
          stopStatusPolling();
        }
      }, POLL_INTERVAL_MS);
    },
    [refresh, stopStatusPolling]
  );

  const generate = useCallback(
    async (params: ImageGenerationRequest): Promise<ImageGenerationResponse | null> => {
      if (!projectId) return null;

      setGenerating(true);
      setError(null);

      try {
        const created = await getClient().generateImage({
          ...params,
          project_id: params.project_id ?? projectId,
        });
        setCurrentGeneration(created);
        await refresh();
        pollGenerationStatus(created.id);
        return created;
      } catch (err) {
        setGenerating(false);
        setError(
          err instanceof Error ? err.message : "Failed to start generation"
        );
        return null;
      }
    },
    [pollGenerationStatus, projectId, refresh]
  );

  const cancelGeneration = useCallback(() => {
    setGenerating(false);
    stopStatusPolling();
  }, [stopStatusPolling]);

  const deleteGeneration = useCallback(
    async (jobId: string) => {
      setError(null);
      try {
        await getClient().deleteGeneration(jobId);
        if (currentGeneration?.id === jobId) {
          setCurrentGeneration(null);
          setGenerating(false);
          stopStatusPolling();
        }
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete generation"
        );
      }
    },
    [currentGeneration?.id, refresh, stopStatusPolling]
  );

  const bulkDelete = useCallback(
    async (jobIds: string[]) => {
      setError(null);
      try {
        for (const jobId of jobIds) {
          await getClient().deleteGeneration(jobId);
          if (currentGeneration?.id === jobId) {
            setCurrentGeneration(null);
            setGenerating(false);
            stopStatusPolling();
          }
        }
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete some generations"
        );
      }
    },
    [currentGeneration?.id, refresh, stopStatusPolling]
  );

  const downloadImage = useCallback(
    async (jobId: string, filename: string) => {
      setError(null);
      try {
        const blob = await getClient().downloadImage(jobId, filename);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to download image"
        );
      }
    },
    []
  );

  const setPage = useCallback(async (page: number) => {
    const newPage = Math.max(1, page);
    currentPageRef.current = newPage;
    setCurrentPage(newPage);
    await refresh();
  }, [refresh]);

  const setFilter = useCallback(async (status: ImageGenerationStatus | "all") => {
    filterStatusRef.current = status;
    currentPageRef.current = 1;
    setFilterStatus(status);
    setCurrentPage(1);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (projectId) {
      refresh();
    }
    // refresh is stable (depends only on projectId), so this effect
    // only fires on projectId changes. Page/filter changes trigger
    // refresh explicitly via setPage/setFilter.
  }, [projectId, refresh]);

  useEffect(() => {
    const hasPending = generations.some(
      (generation) =>
        generation.status === "pending" || generation.status === "processing"
    );

    stopListPolling();
    if (hasPending && projectId) {
      listPollRef.current = setInterval(() => {
        refresh();
      }, POLL_INTERVAL_MS);
    }

    return () => {
      stopListPolling();
    };
  }, [generations, projectId, refresh, stopListPolling]);

  useEffect(() => {
    return () => {
      stopListPolling();
      stopStatusPolling();
    };
  }, [stopListPolling, stopStatusPolling]);

  return {
    generations,
    currentGeneration,
    generating,
    loading,
    error,
    totalCount,
    currentPage,
    filterStatus,
    refresh,
    generate,
    cancelGeneration,
    deleteGeneration,
    bulkDelete,
    downloadImage,
    setPage,
    setFilter,
  };
}
