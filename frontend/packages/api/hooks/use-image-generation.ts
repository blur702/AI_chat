"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "../client";
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationStatus,
  WebSocketMessage,
} from "../types";
import { extractErrorMessage } from "../utils/error";

export interface ImageGenerationProgress {
  generation_id: string;
  queue_running: number;
  queue_pending: number;
  elapsed_seconds: number;
  poll_attempt: number;
}

export interface UseImageGenerationReturn {
  generations: ImageGenerationResponse[];
  currentGeneration: ImageGenerationResponse | null;
  generating: boolean;
  loading: boolean;
  error: string | null;
  totalCount: number;
  currentPage: number;
  filterStatus: ImageGenerationStatus | "all";
  progress: ImageGenerationProgress | null;
  refresh: () => Promise<void>;
  generate: (params: ImageGenerationRequest) => Promise<ImageGenerationResponse | null>;
  cancelGeneration: () => void;
  deleteGeneration: (jobId: string) => Promise<void>;
  bulkDelete: (jobIds: string[]) => Promise<void>;
  downloadImage: (jobId: string, filename: string) => Promise<void>;
  setPage: (page: number) => Promise<void>;
  setFilter: (status: ImageGenerationStatus | "all") => Promise<void>;
  toggleFavorite: (jobId: string) => Promise<void>;
  upscaleGeneration: (jobId: string) => Promise<ImageGenerationResponse | null>;
}

const POLL_INITIAL_MS = 2000;
const POLL_MAX_MS = 15000;
const POLL_BACKOFF_FACTOR = 1.5;
const PAGE_SIZE = 20;

/**
 * Manages ComfyUI image generation for a project, including polling, WebSocket progress events, pagination, and favorites.
 * @param projectId - The project context for generation and history listing.
 * @param wsSubscribe - Optional WebSocket subscribe function for real-time generation progress events.
 * @returns Generation list, current job state, generate/cancel/delete functions, and pagination/filter controls.
 */
export function useImageGeneration(
  projectId: string | null,
  wsSubscribe?: (eventType: string, handler: (msg: WebSocketMessage) => void) => () => void,
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
  const [progress, setProgress] = useState<ImageGenerationProgress | null>(null);

  const currentPageRef = useRef(currentPage);
  const filterStatusRef = useRef(filterStatus);
  currentPageRef.current = currentPage;
  filterStatusRef.current = filterStatus;

  const listPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusPollDelayRef = useRef(POLL_INITIAL_MS);
  const listPollDelayRef = useRef(POLL_INITIAL_MS);
  const listPollActiveRef = useRef(false);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const currentGenerationIdRef = useRef<string | null>(null);

  const stopStatusPolling = useCallback(() => {
    if (statusPollRef.current) {
      clearTimeout(statusPollRef.current);
      statusPollRef.current = null;
    }
    statusPollDelayRef.current = POLL_INITIAL_MS;
  }, []);

  const stopListPolling = useCallback(() => {
    if (listPollRef.current) {
      clearTimeout(listPollRef.current);
      listPollRef.current = null;
    }
    listPollDelayRef.current = POLL_INITIAL_MS;
    listPollActiveRef.current = false;
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
      setError(extractErrorMessage(err, "Failed to load generations"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Self-contained list polling loop that checks the API response directly
  // to decide whether to continue. Not driven by React effects on `generations`.
  const startListPolling = useCallback(() => {
    if (listPollActiveRef.current || !projectIdRef.current) return;
    listPollActiveRef.current = true;
    listPollDelayRef.current = POLL_INITIAL_MS;

    const pollList = async () => {
      if (!listPollActiveRef.current || !projectIdRef.current) return;

      try {
        const skip = (currentPageRef.current - 1) * PAGE_SIZE;
        const statusParam = filterStatusRef.current === "all" ? undefined : filterStatusRef.current;
        const response = await getClient().listGenerations(
          projectIdRef.current, skip, PAGE_SIZE, statusParam
        );
        setGenerations(response.generations);
        setTotalCount(response.count);

        const hasPending = response.generations.some(
          (g) => g.status === "pending" || g.status === "processing"
        );

        if (!hasPending || !listPollActiveRef.current) {
          listPollActiveRef.current = false;
          return;
        }

        listPollDelayRef.current = Math.min(
          listPollDelayRef.current * POLL_BACKOFF_FACTOR,
          POLL_MAX_MS
        );
        listPollRef.current = setTimeout(pollList, listPollDelayRef.current);
      } catch {
        listPollActiveRef.current = false;
      }
    };

    listPollRef.current = setTimeout(pollList, listPollDelayRef.current);
  }, []);

  const pollGenerationStatus = useCallback(
    (jobId: string) => {
      stopStatusPolling();
      statusPollDelayRef.current = POLL_INITIAL_MS;

      const poll = async () => {
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
            return;
          }

          // Backoff: increase delay up to max
          statusPollDelayRef.current = Math.min(
            statusPollDelayRef.current * POLL_BACKOFF_FACTOR,
            POLL_MAX_MS
          );
          statusPollRef.current = setTimeout(poll, statusPollDelayRef.current);
        } catch (err) {
          setGenerating(false);
          setError(
            extractErrorMessage(err, "Failed to poll generation status")
          );
          stopStatusPolling();
        }
      };

      statusPollRef.current = setTimeout(poll, statusPollDelayRef.current);
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
        currentGenerationIdRef.current = created.id;
        setProgress(null);
        await refresh();
        pollGenerationStatus(created.id);
        startListPolling();
        return created;
      } catch (err) {
        setGenerating(false);
        setError(
          extractErrorMessage(err, "Failed to start generation")
        );
        return null;
      }
    },
    [pollGenerationStatus, projectId, refresh, startListPolling]
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
          extractErrorMessage(err, "Failed to delete generation")
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
          extractErrorMessage(err, "Failed to delete some generations")
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
          extractErrorMessage(err, "Failed to download image")
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

  const toggleFavorite = useCallback(async (jobId: string) => {
    setError(null);
    try {
      const updated = await getClient().toggleFavorite(jobId);
      setGenerations((prev) =>
        prev.map((g) => (g.id === jobId ? { ...g, is_favorite: updated.is_favorite } : g))
      );
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to toggle favorite"));
    }
  }, []);

  const upscaleGeneration = useCallback(async (jobId: string): Promise<ImageGenerationResponse | null> => {
    setError(null);
    try {
      const created = await getClient().upscaleImage(jobId);
      setCurrentGeneration(created);
      currentGenerationIdRef.current = created.id;
      setGenerating(true);
      setProgress(null);
      await refresh();
      pollGenerationStatus(created.id);
      startListPolling();
      return created;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to start upscale"));
      return null;
    }
  }, [pollGenerationStatus, refresh, startListPolling]);

  // Initial load
  useEffect(() => {
    if (projectId) {
      refresh();
    }
  }, [projectId, refresh]);

  // Start list polling if there are pending items (e.g. on initial load
  // or page navigation revealing in-progress items)
  useEffect(() => {
    const hasPending = generations.some(
      (generation) =>
        generation.status === "pending" || generation.status === "processing"
    );

    if (hasPending) {
      startListPolling(); // no-op if already active
    }
  }, [generations, startListPolling]);

  // WebSocket subscription for real-time image generation events
  useEffect(() => {
    if (!wsSubscribe) return;

    const unsubStarted = wsSubscribe("image_generation_started", (msg) => {
      const data = msg.data as Record<string, unknown>;
      const genId = data.generation_id as string;
      if (currentGenerationIdRef.current && genId !== currentGenerationIdRef.current) return;
      setProgress(null);
    });

    const unsubProgress = wsSubscribe("image_generation_progress", (msg) => {
      const data = msg.data as Record<string, unknown>;
      const genId = data.generation_id as string;
      if (currentGenerationIdRef.current && genId !== currentGenerationIdRef.current) return;
      setProgress({
        generation_id: genId,
        queue_running: (data.queue_running as number) ?? 0,
        queue_pending: (data.queue_pending as number) ?? 0,
        elapsed_seconds: (data.elapsed_seconds as number) ?? 0,
        poll_attempt: (data.poll_attempt as number) ?? 0,
      });
    });

    const unsubCompleted = wsSubscribe("image_generation_completed", (msg) => {
      const data = msg.data as Record<string, unknown>;
      const genId = data.generation_id as string;
      if (currentGenerationIdRef.current && genId !== currentGenerationIdRef.current) return;
      setGenerating(false);
      setProgress(null);
      stopStatusPolling();
      // Refresh the list to show the completed generation
      refresh();
    });

    const unsubFailed = wsSubscribe("image_generation_failed", (msg) => {
      const data = msg.data as Record<string, unknown>;
      const genId = data.generation_id as string;
      if (currentGenerationIdRef.current && genId !== currentGenerationIdRef.current) return;
      setGenerating(false);
      setProgress(null);
      setError((data.error as string) ?? "Image generation failed");
      stopStatusPolling();
      refresh();
    });

    return () => {
      unsubStarted();
      unsubProgress();
      unsubCompleted();
      unsubFailed();
    };
  }, [wsSubscribe, refresh, stopStatusPolling]);

  // Cleanup on unmount
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
    progress,
    refresh,
    generate,
    cancelGeneration,
    deleteGeneration,
    bulkDelete,
    downloadImage,
    setPage,
    setFilter,
    toggleFavorite,
    upscaleGeneration,
  };
}
