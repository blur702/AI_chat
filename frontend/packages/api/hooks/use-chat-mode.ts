"use client";

import { useState, useCallback, useEffect } from "react";
import { getClient } from "../client";

export const CHAT_MODES = [
  { key: "agent", label: "Full Agent", icon: "Bot", description: "Autonomous code actions" },
  { key: "suggest", label: "Suggestions", icon: "Code", description: "Code in markdown blocks, no execution" },
  { key: "plan", label: "Plan", icon: "Map", description: "Research, ask questions, create plans" },
  { key: "ask", label: "Ask", icon: "HelpCircle", description: "Q&A about the codebase" },
  { key: "chat", label: "Chat", icon: "MessageCircle", description: "Natural conversation" },
] as const;

export type ChatMode = (typeof CHAT_MODES)[number]["key"];

export interface UseChatModeReturn {
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => Promise<void>;
  /** Update local state from server value without triggering an API call. */
  syncFromServer: (mode: string) => void;
  modes: typeof CHAT_MODES;
}

const VALID_KEYS = new Set<string>(CHAT_MODES.map((m) => m.key));

function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && VALID_KEYS.has(value);
}

/**
 * Manages the active chat mode for a chat session, persisting changes to the backend.
 * Optimistically reverts to the previous mode if the API call fails.
 * @param chatId - The chat to update when mode changes, or `null` for local-only state.
 * @param initialMode - Optional mode to initialize from (e.g. from a loaded conversation).
 * @returns Current mode, `setChatMode` async setter, `syncFromServer` for server-driven updates, and the modes list.
 */
export function useChatMode(
  chatId: string | null,
  initialMode?: string,
): UseChatModeReturn {
  const [chatMode, setChatModeState] = useState<ChatMode>(
    isChatMode(initialMode) ? initialMode : "agent"
  );

  // Sync from external initial value (conversation state load)
  useEffect(() => {
    if (isChatMode(initialMode)) {
      setChatModeState(initialMode);
    }
  }, [initialMode]);

  const syncFromServer = useCallback((mode: string) => {
    if (isChatMode(mode)) {
      setChatModeState(mode);
    }
  }, []);

  const setChatMode = useCallback(
    async (mode: ChatMode) => {
      if (!isChatMode(mode)) return;
      const prev = chatMode;
      setChatModeState(mode);
      if (chatId) {
        try {
          await getClient().updateChatMode(chatId, mode);
        } catch {
          setChatModeState(prev);
        }
      }
    },
    [chatId, chatMode]
  );

  return { chatMode, setChatMode, syncFromServer, modes: CHAT_MODES };
}
