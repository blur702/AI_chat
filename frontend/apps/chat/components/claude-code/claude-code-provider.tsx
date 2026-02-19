"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

interface ClaudeCodeContextValue {
  isOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const ClaudeCodeContext = createContext<ClaudeCodeContextValue | null>(null);

export function useClaudeCode() {
  const ctx = useContext(ClaudeCodeContext);
  if (!ctx) throw new Error("useClaudeCode must be used within ClaudeCodeProvider");
  return ctx;
}

export function ClaudeCodeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);
  const togglePanel = useCallback(() => setIsOpen((prev) => !prev), []);

  // Keyboard shortcut: Ctrl+Shift+C
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      if (isCtrlOrCmd && e.shiftKey && e.key === "C") {
        e.preventDefault();
        togglePanel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [togglePanel]);

  return (
    <ClaudeCodeContext.Provider value={{ isOpen, openPanel, closePanel, togglePanel }}>
      {children}
    </ClaudeCodeContext.Provider>
  );
}
