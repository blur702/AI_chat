"use client";

import { AuthProvider } from "@workstation/api";
import { HelpProvider } from "../components/help/help-provider";
import { HelpModal } from "../components/help/help-modal";
import { ToastProvider } from "../components/toast-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <HelpProvider>
          {children}
          <HelpModal />
        </HelpProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
