"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

interface NotesContextValue {
  isOpen: boolean;
  openNotes: () => void;
  closeNotes: () => void;
  toggleNotes: () => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within NotesProvider");
  return ctx;
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openNotes = useCallback(() => setIsOpen(true), []);
  const closeNotes = useCallback(() => setIsOpen(false), []);
  const toggleNotes = useCallback(() => setIsOpen((prev) => !prev), []);

  // Keyboard shortcut: Ctrl+Shift+N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "N") {
        e.preventDefault();
        toggleNotes();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleNotes]);

  return (
    <NotesContext.Provider value={{ isOpen, openNotes, closeNotes, toggleNotes }}>
      {children}
    </NotesContext.Provider>
  );
}
