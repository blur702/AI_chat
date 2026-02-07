"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { ConversationState, MessageSummary } from "../types";

interface UseConversationReturn {
  conversation: ConversationState | null;
  messages: MessageSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  sendMessage: (content: string, role?: string) => Promise<boolean>;
}

export function useConversation(chatId: string | null): UseConversationReturn {
  const [conversation, setConversation] = useState<ConversationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!chatId) return;
    try {
      setLoading(true);
      setError(null);
      const state = await getClient().getConversationState(chatId);
      setConversation(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch conversation");
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    if (chatId) {
      refresh();
    } else {
      setConversation(null);
    }
  }, [chatId, refresh]);

  const sendMessage = useCallback(
    async (content: string, role = "user"): Promise<boolean> => {
      if (!chatId || !conversation) return false;

      // Optimistically add the message
      const tempMessage: MessageSummary = {
        id: `temp-${Date.now()}`,
        role,
        content,
        is_pinned: false,
        is_excluded: false,
        created_at: new Date().toISOString(),
      };

      setConversation((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, tempMessage] }
          : prev
      );

      // TODO: POST /api/context/conversations/:chatId/messages when backend supports it
      // For now this is optimistic-only
      return true;
    },
    [chatId, conversation]
  );

  return {
    conversation,
    messages: conversation?.messages ?? [],
    loading,
    error,
    refresh,
    sendMessage,
  };
}
