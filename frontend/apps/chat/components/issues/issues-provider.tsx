"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

interface IssuesContextValue {
  isOpen: boolean;
  openIssues: () => void;
  closeIssues: () => void;
  toggleIssues: () => void;
}

const IssuesContext = createContext<IssuesContextValue | null>(null);

export function useIssuesPanel() {
  const ctx = useContext(IssuesContext);
  if (!ctx) throw new Error("useIssuesPanel must be used within IssuesProvider");
  return ctx;
}

export function IssuesProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openIssues = useCallback(() => setIsOpen(true), []);
  const closeIssues = useCallback(() => setIsOpen(false), []);
  const toggleIssues = useCallback(() => setIsOpen((prev) => !prev), []);

  // Keyboard shortcut: Ctrl+Shift+I
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "I") {
        e.preventDefault();
        toggleIssues();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleIssues]);

  return (
    <IssuesContext.Provider value={{ isOpen, openIssues, closeIssues, toggleIssues }}>
      {children}
    </IssuesContext.Provider>
  );
}
