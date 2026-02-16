"use client";

import { AuthProvider } from "@workstation/api";
import { HelpProvider } from "../components/help/help-provider";
import { HelpModal } from "../components/help/help-modal";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <HelpProvider>
        {children}
        <HelpModal />
      </HelpProvider>
    </AuthProvider>
  );
}
