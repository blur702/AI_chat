"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getClient } from "../client";
import type { ConversationState, MessageSummary, FileNode } from "../types";
import { useTokenUsage } from "./use-token-usage";
import type { TokenUsage } from "./use-token-usage";

interface SandboxContext {
  selectedFile: string | null;
  fileTree: FileNode[] | null;
  terminalHistory: string[];
}

interface UseSandboxConversationReturn {
  messages: MessageSummary[];
  loading: boolean;
  processing: boolean;
  progress: number;
  error: string | null;
  tokenUsage: TokenUsage | null;
  sendMessage: (content: string) => Promise<boolean>;
}

function summarizeFileTree(nodes: FileNode[]): string {
  let fileCount = 0;
  let dirCount = 0;
  const names: string[] = [];

  function walk(items: FileNode[]) {
    for (const item of items) {
      if (item.type === "directory") {
        dirCount++;
        if (item.children) walk(item.children);
      } else {
        fileCount++;
        if (names.length < 15) names.push(item.path);
      }
    }
  }

  walk(nodes);
  let summary = `Files: ${names.join(", ")}`;
  if (fileCount > 15) summary += `, ... (${fileCount} files total)`;
  if (dirCount > 0) summary += ` | ${dirCount} directories`;
  return summary;
}

export function useSandboxConversation(
  projectId: string,
  context: SandboxContext
): UseSandboxConversationReturn {
  const [chatId, setChatId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  const { tokenUsage, setFromStream } = useTokenUsage(chatId);
  const setFromStreamRef = useRef(setFromStream);
  setFromStreamRef.current = setFromStream;

  const clearProgress = useCallback(() => {
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearProgress();
      abortRef.current?.();
      abortRef.current = null;
    };
  }, [clearProgress]);

  // Initialize: get or create the default sandbox chat
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setChatId(null);
    setConversation(null);
    setLoading(true);
    setError(null);

    getClient()
      .getOrCreateProjectChat(projectId)
      .then((res) => {
        if (cancelled) return;
        setChatId(res.chat_id);
        setConversation(res.conversation);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to initialize chat");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
    setTimeout(() => {
      setProcessing(false);
      setProgress(0);
    }, 400);
  }, [clearProgress]);

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!chatId) return false;

      // Cancel any in-flight stream
      abortRef.current?.();

      // Build context-enriched content
      const ctx = contextRef.current;
      let enrichedContent = content;
      const contextParts: string[] = [];

      if (ctx.selectedFile) {
        contextParts.push(`[Current file: ${ctx.selectedFile}]`);
      }
      if (ctx.fileTree && ctx.fileTree.length > 0) {
        contextParts.push(`[Project files: ${summarizeFileTree(ctx.fileTree)}]`);
      }
      if (ctx.terminalHistory.length > 0) {
        const recent = ctx.terminalHistory.slice(-10);
        contextParts.push(`[Recent terminal commands: ${recent.join("; ")}]`);
      }

      if (contextParts.length > 0) {
        enrichedContent = `${contextParts.join("\n")}\n\n${content}`;
      }

      // Optimistically add user message (display original content, not enriched)
      const tempMessage: MessageSummary = {
        id: `temp-${Date.now()}`,
        role: "user",
        content,
        is_pinned: false,
        is_excluded: false,
        created_at: new Date().toISOString(),
      };

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
        enrichedContent,
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
                ? {
                    ...m,
                    id: data.message_id,
                    metadata: { model: data.model },
                    created_at: data.created_at ?? m.created_at,
                  }
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
            const msgs = prev.messages.filter(
              (m) => m.id !== assistantTempId || m.content.length > 0
            );
            return { ...prev, messages: msgs };
          });
          setError(errMsg);
          finishProgress();
          abortRef.current = null;
        }
      );

      abortRef.current = cancel;
      return true;
    },
    [chatId, startProgress, finishProgress]
  );

  return {
    messages: conversation?.messages ?? [],
    loading,
    processing,
    progress,
    error,
    tokenUsage,
    sendMessage,
  };
}
