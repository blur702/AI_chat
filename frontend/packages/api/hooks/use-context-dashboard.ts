"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getClient } from "../client";
import type { TokenBreakdownResponse, CompactionStatusResponse } from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseContextDashboardReturn {
  breakdown: TokenBreakdownResponse | null;
  loading: boolean;
  compacting: boolean;
  error: string | null;
  fetchBreakdown: () => Promise<void>;
  triggerCompaction: () => Promise<{ status: string; compaction_id?: string } | null>;
  compactionId: string | null;
  compactionStatus: CompactionStatusResponse | null;
}

/**
 * Fetches the token breakdown for a chat and manages context compaction, polling until completion.
 * @param chatId - The chat whose context to inspect, or `null` to skip fetching.
 * @returns Token breakdown, compaction state/status, and `fetchBreakdown`/`triggerCompaction` functions.
 */
export function useContextDashboard(chatId: string | null): UseContextDashboardReturn {
  const [breakdown, setBreakdown] = useState<TokenBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compactionId, setCompactionId] = useState<string | null>(null);
  const [compactionStatus, setCompactionStatus] = useState<CompactionStatusResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBreakdown = useCallback(async () => {
    if (!chatId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getClient().getTokenBreakdown(chatId);
      setBreakdown(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to fetch token breakdown"));
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  const triggerCompaction = useCallback(async () => {
    if (!chatId) return null;
    try {
      setCompacting(true);
      setError(null);
      const result = await getClient().triggerCompaction(chatId);
      if (result.compaction_id) {
        setCompactionId(result.compaction_id);
        setCompactionStatus({
          id: result.compaction_id,
          status: "pending",
          original_message_count: 0,
          compacted_message_count: 0,
        });
      }
      return result;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to trigger compaction"));
      return null;
    }
  }, [chatId]);

  // Poll compaction status when compactionId is set
  useEffect(() => {
    if (!chatId || !compactionId) return;

    const poll = async () => {
      try {
        const status = await getClient().getCompactionStatus(chatId, compactionId);
        setCompactionStatus(status);

        if (status.status === "completed" || status.status === "failed") {
          // Stop polling
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setCompacting(false);
          // Refresh breakdown after compaction completes
          if (status.status === "completed") {
            await fetchBreakdown();
          }
        }
      } catch {
        // If status fetch fails, stop polling
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setCompacting(false);
      }
    };

    pollRef.current = setInterval(poll, 2000);
    // Run immediately
    poll();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [chatId, compactionId, fetchBreakdown]);

  return {
    breakdown,
    loading,
    compacting,
    error,
    fetchBreakdown,
    triggerCompaction,
    compactionId,
    compactionStatus,
  };
}
