"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, useBreakpoint } from "@workstation/ui";
import { useAuth, getClient } from "@workstation/api";
import { Menu } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ServiceStatusBanner } from "@/components/service-status-banner";
import { SystemStatusBar } from "@/components/system-status-bar";

const PROJECT_ID_KEY = "workstation_chat_project_id";

function useProjectId(): string | null {
  const [projectId, setProjectId] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    let storedId: string | null = null;
    try {
      storedId = localStorage.getItem(PROJECT_ID_KEY);
    } catch {
      // localStorage may be unavailable (private browsing, etc.)
    }
    const envId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID;
    const id = storedId || envId || null;
    if (id) {
      setProjectId(id);
      try {
        localStorage.setItem(PROJECT_ID_KEY, id);
      } catch {
        // Ignore write failures
      }
      return;
    }

    // Wait until authenticated before calling API
    if (!isAuthenticated) return;

    // No project ID found locally — fetch from API or create a default
    (async () => {
      try {
        const client = getClient();
        const res = await client.listProjects();
        let pid: string | null = null;
        if (res.projects && res.projects.length > 0) {
          pid = res.projects[0].id;
        } else {
          const created = await client.createProject({
            name: "Default Project",
            path: "default",
          });
          pid = created.id;
        }
        if (pid) {
          setProjectId(pid);
          try {
            localStorage.setItem(PROJECT_ID_KEY, pid);
          } catch {
            // Ignore write failures
          }
        }
      } catch {
        // API unavailable — will retry on next mount
      }
    })();
  }, [isAuthenticated]);

  return projectId;
}

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isMobile } = useBreakpoint();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const projectId = useProjectId();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

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

      <ServiceStatusBanner />

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
