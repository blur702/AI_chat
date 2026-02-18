"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button, cn, useBreakpoint } from "@workstation/ui";
import { useAuth } from "@workstation/api";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ServiceStatusBanner } from "@/components/service-status-banner";
import { SystemStatusBar } from "@/components/system-status-bar";
import { useProjectId } from "@/app/hooks/use-project-id";

const SIDEBAR_KEY = "workstation_sidebar_collapsed";

interface SidebarLayoutProps {
  children: React.ReactNode;
  mobileTitle?: string;
}

export function SidebarLayout({ children, mobileTitle = "AI Workstation" }: SidebarLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { isMobile } = useBreakpoint();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const projectId = useProjectId();

  // Restore collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      if (stored === "true") setCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, router, pathname]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col">
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
        {/* Desktop collapse toggle */}
        {!isMobile && (
          <div
            className={cn(
              "relative shrink-0 transition-[width] duration-200 ease-in-out",
              collapsed ? "w-0" : "w-64",
            )}
          >
            <div
              className={cn(
                "h-full w-64 overflow-hidden transition-transform duration-200 ease-in-out",
                collapsed && "-translate-x-full",
              )}
            >
              <ChatSidebar
                projectId={projectId}
                mobileOpen={mobileOpen}
                onMobileClose={() => setMobileOpen(false)}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-8 top-2 z-10 h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}

        {/* Mobile sidebar (rendered via ChatSidebar's own mobile overlay) */}
        {isMobile && (
          <ChatSidebar
            projectId={projectId}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
          />
        )}

        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
      <SystemStatusBar />
    </div>
  );
}
