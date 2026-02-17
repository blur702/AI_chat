"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
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
      // localStorage may be unavailable
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

    if (!isAuthenticated) return;

    let cancelled = false;
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
        if (pid && !cancelled) {
          setProjectId(pid);
          try {
            localStorage.setItem(PROJECT_ID_KEY, pid);
          } catch {
            // Ignore write failures
          }
        }
      } catch {
        // API unavailable
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return projectId;
}

export default function DrupalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isMobile } = useBreakpoint();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = useProjectId();

  // NOTE: useAuth may briefly return isAuthenticated=false while restoring
  // the session from storage. If AuthProvider gains an `isLoading` flag,
  // guard this redirect behind `!isLoading` to avoid a flash redirect.
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, router, pathname]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen flex-col">
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
          <span className="ml-2 text-sm font-semibold">Drupal Manager</span>
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
