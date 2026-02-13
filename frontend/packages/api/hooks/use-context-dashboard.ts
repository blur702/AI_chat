"use client";

import { useState, useCallback } from "react";
import { getClient } from "../client";
import type { TokenBreakdownResponse } from "../types";

export interface UseContextDashboardReturn {
  breakdown: TokenBreakdownResponse | null;
  loading: boolean;
  compacting: boolean;
  error: string | null;
  fetchBreakdown: () => Promise<void>;
  triggerCompaction: () => Promise<{ status: string; compaction_id?: string } | null>;
}

export function useContextDashboard(chatId: string | null): UseContextDashboardReturn {
  const [breakdown, setBreakdown] = useState<TokenBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBreakdown = useCallback(async () => {
    if (!chatId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getClient().getTokenBreakdown(chatId);
      setBreakdown(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch token breakdown");
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
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger compaction");
      return null;
    } finally {
      setCompacting(false);
    }
  }, [chatId]);

  return {
    breakdown,
    loading,
    compacting,
    error,
    fetchBreakdown,
    triggerCompaction,
  };
}
