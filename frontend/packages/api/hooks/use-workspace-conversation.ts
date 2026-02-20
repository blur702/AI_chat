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

interface UseWorkspaceConversationReturn {
  chatId: string | null;
  messages: MessageSummary[];
  loading: boolean;
  processing: boolean;
  progress: number;
  error: string | null;
  tokenUsage: TokenUsage | null;
  sendMessage: (content: string) => Promise<boolean>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Manages a workspace/IDE conversation for a project, enriching messages with sandbox context (file, file tree, terminal history).
 * Loads a specified chat by `externalChatId` or auto-creates/retrieves the default project chat.
 * @param projectId - The project whose workspace conversation to manage.
 * @param context - Sandbox context (selected file, file tree, terminal history) prepended to each message.
 * @param externalChatId - Optional specific chat ID to load; falls back to the project default if omitted.
 * @returns Chat ID, messages, streaming progress, error state, and a `sendMessage` function.
 */
export function useWorkspaceConversation(
  projectId: string,
  context: SandboxContext,
  externalChatId?: string | null
): UseWorkspaceConversationReturn {
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

  // Initialize: load specified chat or get/create the default sandbox chat
  useEffect(() => {
    if (!projectId) return;

    // Cancel any in-flight stream from previous chat
    abortRef.current?.();
    abortRef.current = null;
    clearProgress();

    let cancelled = false;
    setChatId(null);
    setConversation(null);
    setLoading(true);
    setError(null);

    if (externalChatId) {
      // Validate UUID format before making API call
      if (!UUID_RE.test(externalChatId)) {
        setError("Invalid chat ID format");
        setLoading(false);
        return;
      }

      // Load a specific chat by ID
      getClient()
        .getConversationState(externalChatId)
        .then((conv) => {
          if (cancelled) return;
          // Verify this chat belongs to the current project
          if (conv.project_id !== projectId) {
            setError("Chat does not belong to this project");
            return;
          }
          setChatId(externalChatId);
          setConversation(conv);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to load chat");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      // Default behavior: get or create the project's default chat
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
    }

    return () => {
      cancelled = true;
    };
  }, [projectId, externalChatId, clearProgress]);

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

      setError(null);

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
      const tempId = crypto.randomUUID();
      const tempMessage: MessageSummary = {
        id: `temp-user-${tempId}`,
        role: "user",
        content,
        is_pinned: false,
        is_excluded: false,
        created_at: new Date().toISOString(),
      };

      const assistantTempId = `temp-assistant-${tempId}`;
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
    chatId,
    messages: conversation?.messages ?? [],
    loading,
    processing,
    progress,
    error,
    tokenUsage,
    sendMessage,
  };
}

/** @deprecated Use useWorkspaceConversation instead */
export const useSandboxConversation = useWorkspaceConversation;
