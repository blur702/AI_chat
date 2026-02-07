"use client";

import { useState } from "react";
import { Button, useBreakpoint } from "@workstation/ui";
import { Menu } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { SystemStatusBar } from "@/components/system-status-bar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isMobile } = useBreakpoint();

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
