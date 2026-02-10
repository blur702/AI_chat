"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { ChatSummary, ChatUpdateRequest } from "../types";

interface UseChatsReturn {
  chats: ChatSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createChat: (title: string) => Promise<string | null>;
  updateChat: (chatId: string, updates: ChatUpdateRequest) => Promise<boolean>;
  deleteChat: (chatId: string) => Promise<boolean>;
}

export function useChats(projectId: string | null): UseChatsReturn {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().getProjectChats(projectId);
      setChats(res.chats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch chats");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      refresh();
    } else {
      setChats([]);
    }
  }, [projectId, refresh]);

  const createChat = useCallback(
    async (title: string): Promise<string | null> => {
      if (!projectId) return null;
      try {
        setError(null);
        const res = await getClient().createChat(projectId, title);
        await refresh();
        return res.id;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create chat");
        return null;
      }
    },
    [projectId, refresh]
  );

  const updateChat = useCallback(
    async (chatId: string, updates: ChatUpdateRequest): Promise<boolean> => {
      try {
        setError(null);
        const updated = await getClient().updateChat(chatId, updates);
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  title: updated.title,
                  is_pinned: updated.is_pinned,
                  is_archived: updated.is_archived,
                  updated_at: updated.updated_at,
                }
              : c
          )
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update chat");
        return false;
      }
    },
    []
  );

  const deleteChat = useCallback(
    async (chatId: string): Promise<boolean> => {
      try {
        setError(null);
        await getClient().deleteChat(chatId);
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete chat");
        return false;
      }
    },
    []
  );

  return { chats, loading, error, refresh, createChat, updateChat, deleteChat };
}
