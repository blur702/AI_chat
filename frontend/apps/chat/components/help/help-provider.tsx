"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

interface HelpContextValue {
  isOpen: boolean;
  activeSection: string | null;
  openHelp: (sectionId?: string) => void;
  closeHelp: () => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function useHelp() {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelp must be used within HelpProvider");
  return ctx;
}

export function HelpProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const openHelp = useCallback((sectionId?: string) => {
    setActiveSection(sectionId ?? null);
    setIsOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setIsOpen(false);
    setActiveSection(null);
  }, []);

  // Keyboard shortcut: "?" opens help (when not focused on an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setIsOpen((prev) => !prev);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <HelpContext.Provider value={{ isOpen, activeSection, openHelp, closeHelp }}>
      {children}
    </HelpContext.Provider>
  );
}
