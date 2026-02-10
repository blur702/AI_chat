"use client";

import { useState, useEffect } from "react";
import { Button, useBreakpoint } from "@workstation/ui";
import { Menu } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { SystemStatusBar } from "@/components/system-status-bar";

const PROJECT_ID_KEY = "workstation_chat_project_id";

function useProjectId(): string | null {
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    const storedId = localStorage.getItem(PROJECT_ID_KEY);
    const envId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID;
    const id = storedId || envId || null;
    if (id) {
      setProjectId(id);
      localStorage.setItem(PROJECT_ID_KEY, id);
    }
  }, []);

  return projectId;
}

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isMobile } = useBreakpoint();
  const projectId = useProjectId();

  return (
    <div className="flex h-screen flex-col">
      {/* Mobile header with hamburger */}
      {isMobile && (
        <div className="flex items-center border-b bg-sidebar px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-2 text-sm font-semibold">AI Chat</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar
          projectId={projectId}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
      <SystemStatusBar />
    </div>
  );
}
