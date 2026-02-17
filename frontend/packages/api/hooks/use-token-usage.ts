"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getClient } from "../client";
import type { TokenUsageResponse } from "../types";

export interface TokenUsage {
  current_tokens: number;
  max_tokens: number;
  usage_ratio: number;
}

interface UseTokenUsageReturn {
  tokenUsage: TokenUsage | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Update token usage locally from SSE done event data */
  setFromStream: (data: {
    token_count?: number;
    max_tokens?: number;
    usage_ratio?: number;
  }) => void;
}

/**
 * Fetches token usage for a chat and optionally polls at a given interval.
 * Exposes `setFromStream` for optimistic updates from SSE done-event payloads without an extra API round-trip.
 * @param chatId - The chat to track, or `null` to clear usage state.
 * @param pollIntervalMs - Optional polling interval in milliseconds (0 disables polling).
 * @returns Current token usage, loading state, a `refresh` callback, and `setFromStream` for local updates.
 */
export function useTokenUsage(
  chatId: string | null,
  pollIntervalMs = 0
): UseTokenUsageReturn {
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!chatId) return;
    try {
      setLoading(true);
      const data: TokenUsageResponse = await getClient().getTokenUsage(chatId);
      setTokenUsage({
        current_tokens: data.current_tokens,
        max_tokens: data.max_tokens,
        usage_ratio: data.usage_ratio,
      });
    } catch {
      // Silently ignore — token usage is non-critical
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  const setFromStream = useCallback(
    (data: {
      token_count?: number;
      max_tokens?: number;
      usage_ratio?: number;
    }) => {
      if (
        data.token_count != null &&
        data.max_tokens != null &&
        data.usage_ratio != null
      ) {
        setTokenUsage({
          current_tokens: data.token_count,
          max_tokens: data.max_tokens,
          usage_ratio: data.usage_ratio,
        });
      }
    },
    []
  );

  // Initial fetch
  useEffect(() => {
    if (chatId) {
      refresh();
    } else {
      setTokenUsage(null);
    }
  }, [chatId, refresh]);

  // Optional polling
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (chatId && pollIntervalMs > 0) {
      intervalRef.current = setInterval(refresh, pollIntervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [chatId, pollIntervalMs, refresh]);

  return { tokenUsage, loading, refresh, setFromStream };
}
