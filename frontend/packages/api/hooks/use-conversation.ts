"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getClient } from "../client";
import type { ConversationState, MessageSummary } from "../types";
import { useTokenUsage } from "./use-token-usage";
import type { TokenUsage } from "./use-token-usage";

interface UseConversationReturn {
  conversation: ConversationState | null;
  messages: MessageSummary[];
  loading: boolean;
  processing: boolean;
  progress: number;
  error: string | null;
  tokenUsage: TokenUsage | null;
  refresh: () => Promise<void>;
  sendMessage: (content: string, role?: string) => Promise<boolean>;
  cancelStream: () => void;
  updateMessage: (messageId: string, data: { content?: string; is_pinned?: boolean; is_excluded?: boolean }) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  pinMessage: (messageId: string, pinned: boolean) => Promise<boolean>;
  excludeMessage: (messageId: string, excluded: boolean) => Promise<boolean>;
}

export function useConversation(chatId: string | null, activeModel?: string | null): UseConversationReturn {
  const [conversation, setConversation] = useState<ConversationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const { tokenUsage, setFromStream } = useTokenUsage(chatId);
  const setFromStreamRef = useRef(setFromStream);
  setFromStreamRef.current = setFromStream;

  const clearProgress = useCallback(() => {
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
  }, []);

  // Cleanup on unmount or chat change
  useEffect(() => {
    return () => {
      clearProgress();
      setProcessing(false);
      setProgress(0);
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      abortRef.current?.();
      abortRef.current = null;
    };
  }, [clearProgress, chatId]);

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

  const startProgress = useCallback(() => {
    clearProgress();
    setProgress(0);
    setProcessing(true);

    let current = 0;
    progressRef.current = setInterval(() => {
      const remaining = 95 - current;
      const step = Math.max(0.5, remaining * 0.08);
      current = Math.min(95, current + step);
      setProgress(Math.round(current));
    }, 200);
  }, [clearProgress]);

  const finishProgress = useCallback(() => {
    clearProgress();
    setProgress(100);
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
    }
    finishTimerRef.current = setTimeout(() => {
      setProcessing(false);
      setProgress(0);
      finishTimerRef.current = null;
    }, 400);
  }, [clearProgress]);

  const cancelStream = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current();
    abortRef.current = null;
    clearProgress();
    setProcessing(false);
    setProgress(0);
  }, [clearProgress]);

  const sendMessage = useCallback(
    async (content: string, role = "user"): Promise<boolean> => {
      if (!chatId || !conversation) return false;

      // Cancel any in-flight stream
      abortRef.current?.();

      // Clear any prior error
      setError(null);

      // Optimistically add user message
      const tempMessage: MessageSummary = {
        id: `temp-${Date.now()}`,
        role,
        content,
        is_pinned: false,
        is_excluded: false,
        created_at: new Date().toISOString(),
      };

      // Add temporary assistant message for streaming
      const assistantTempId = `temp-assistant-${Date.now()}`;
      const assistantMessage: MessageSummary = {
        id: assistantTempId,
        role: "assistant",
        content: "",
        is_pinned: false,
        is_excluded: false,
        created_at: new Date().toISOString(),
      };

      setConversation((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, tempMessage, assistantMessage] }
          : prev
      );

      startProgress();

      const cancel = getClient().streamMessage(
        chatId,
        content,
        // onToken
        (token) => {
          setConversation((prev) => {
            if (!prev) return prev;
            const msgs = prev.messages.map((m) =>
              m.id === assistantTempId
                ? { ...m, content: m.content + token }
                : m
            );
            return { ...prev, messages: msgs };
          });
        },
        // onDone
        (data) => {
          setConversation((prev) => {
            if (!prev) return prev;
            const msgs = prev.messages.map((m) =>
              m.id === assistantTempId
                ? { ...m, id: data.message_id, metadata: { model: data.model }, created_at: data.created_at ?? m.created_at }
                : m
            );
            return { ...prev, messages: msgs };
          });
          setFromStreamRef.current(data);
          finishProgress();
          abortRef.current = null;
        },
        // onError
        (errMsg) => {
          setConversation((prev) => {
            if (!prev) return prev;
            // Remove the empty assistant placeholder on error
            const msgs = prev.messages.filter((m) => m.id !== assistantTempId || m.content.length > 0);
            return { ...prev, messages: msgs };
          });
          setError(errMsg);
          finishProgress();
          abortRef.current = null;
        },
        activeModel ?? undefined,
      );

      abortRef.current = cancel;
      return true;
    },
    [chatId, conversation, startProgress, finishProgress, activeModel]
  );

  const updateMessage = useCallback(
    async (messageId: string, data: { content?: string; is_pinned?: boolean; is_excluded?: boolean }): Promise<boolean> => {
      if (!chatId) return false;
      try {
        setError(null);
        const updated = await getClient().updateMessage(chatId, messageId, data);
        setConversation((prev) => {
          if (!prev) return prev;
          const msgs = prev.messages.map((m) =>
            m.id === messageId
              ? { ...m, content: updated.content, is_pinned: updated.is_pinned, is_excluded: updated.is_excluded }
              : m
          );
          return { ...prev, messages: msgs };
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update message");
        return false;
      }
    },
    [chatId]
  );

  const deleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!chatId) return false;
      try {
        setError(null);
        await getClient().deleteMessage(chatId, messageId);
        setConversation((prev) => {
          if (!prev) return prev;
          return { ...prev, messages: prev.messages.filter((m) => m.id !== messageId) };
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete message");
        return false;
      }
    },
    [chatId]
  );

  const pinMessage = useCallback(
    async (messageId: string, pinned: boolean): Promise<boolean> => {
      return updateMessage(messageId, { is_pinned: pinned });
    },
    [updateMessage]
  );

  const excludeMessage = useCallback(
    async (messageId: string, excluded: boolean): Promise<boolean> => {
      return updateMessage(messageId, { is_excluded: excluded });
    },
    [updateMessage]
  );

  return {
    conversation,
    messages: conversation?.messages ?? [],
    loading,
    processing,
    progress,
    error,
    tokenUsage,
    refresh,
    sendMessage,
    cancelStream,
    updateMessage,
    deleteMessage,
    pinMessage,
    excludeMessage,
  };
}
