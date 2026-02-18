"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button, useBreakpoint } from "@workstation/ui";
import { useAuth } from "@workstation/api";
import { Menu } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ServiceStatusBanner } from "@/components/service-status-banner";
import { SystemStatusBar } from "@/components/system-status-bar";
import { useProjectId } from "@/app/hooks/use-project-id";

interface SidebarLayoutProps {
  children: React.ReactNode;
  /** Label shown in mobile header bar */
  mobileTitle?: string;
}

export function SidebarLayout({ children, mobileTitle = "AI Workstation" }: SidebarLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isMobile } = useBreakpoint();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = useProjectId();

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
          <span className="ml-2 text-sm font-semibold">{mobileTitle}</span>
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
