"use client";

import { AuthProvider } from "@workstation/api";
import { HelpProvider } from "../components/help/help-provider";
import { HelpModal } from "../components/help/help-modal";
import { NotesProvider } from "../components/notes/notes-provider";
import { NotesModal } from "../components/notes/notes-modal";
import { IssuesProvider } from "../components/issues/issues-provider";
import { IssuesModal } from "../components/issues/issues-modal";
import { ToastProvider } from "../components/toast-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <HelpProvider>
          <NotesProvider>
            <IssuesProvider>
              {children}
              <HelpModal />
              <NotesModal />
              <IssuesModal />
            </IssuesProvider>
          </NotesProvider>
        </HelpProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
