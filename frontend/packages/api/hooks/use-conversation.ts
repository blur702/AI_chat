"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getClient } from "../client";
import type { ConversationState, MessageSummary } from "../types";

interface UseConversationReturn {
  conversation: ConversationState | null;
  messages: MessageSummary[];
  loading: boolean;
  processing: boolean;
  progress: number;
  error: string | null;
  refresh: () => Promise<void>;
  sendMessage: (content: string, role?: string) => Promise<boolean>;
}

export function useConversation(chatId: string | null): UseConversationReturn {
  const [conversation, setConversation] = useState<ConversationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

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

  const sendMessage = useCallback(
    async (content: string, role = "user"): Promise<boolean> => {
      if (!chatId || !conversation) return false;

      // Cancel any in-flight stream
      abortRef.current?.();

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
      );

      abortRef.current = cancel;
      return true;
    },
    [chatId, conversation, startProgress, finishProgress]
  );

  return {
    conversation,
    messages: conversation?.messages ?? [],
    loading,
    processing,
    progress,
    error,
    refresh,
    sendMessage,
  };
}
