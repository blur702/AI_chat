"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

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

  return (
    <HelpContext.Provider value={{ isOpen, activeSection, openHelp, closeHelp }}>
      {children}
    </HelpContext.Provider>
  );
}
