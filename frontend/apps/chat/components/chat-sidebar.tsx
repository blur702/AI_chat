"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, ScrollArea, cn, useBreakpoint, useSwipe } from "@workstation/ui";
import { Plus, MessageSquare, Settings } from "lucide-react";

interface ChatEntry {
  id: string;
  title: string;
  updatedAt: string;
}

// Mock data until backend supports chat CRUD
const MOCK_CHATS: ChatEntry[] = [
  { id: "chat-1", title: "React component architecture", updatedAt: "2m ago" },
  { id: "chat-2", title: "Database optimization", updatedAt: "1h ago" },
  { id: "chat-3", title: "API design patterns", updatedAt: "3h ago" },
  { id: "chat-4", title: "Docker networking setup", updatedAt: "1d ago" },
];

interface ChatSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function ChatSidebar({ mobileOpen: mobileOpenProp, onMobileClose: onMobileCloseProp }: ChatSidebarProps) {
  const pathname = usePathname();
  const [chats] = useState<ChatEntry[]>(MOCK_CHATS);
  const { isMobile } = useBreakpoint();
  const sidebarRef = useRef<HTMLElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);

  const mobileOpen = mobileOpenProp ?? internalOpen;
  const onMobileClose = onMobileCloseProp ?? (() => setInternalOpen(false));

  const swipeHandlers = useSwipe(sidebarRef, {
    onSwipeLeft: () => onMobileClose(),
  });

  const handleChatSelect = () => {
    if (isMobile) onMobileClose();
  };

  // On mobile, render as overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-standard"
            onClick={onMobileClose}
            aria-hidden="true"
          />
        )}
        {/* Sidebar drawer */}
        <nav
          ref={sidebarRef}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-sidebar transition-transform duration-standard ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
          role="navigation"
          aria-label="Chat navigation"
          aria-hidden={!mobileOpen}
          {...swipeHandlers}
        >
          <SidebarContent
            chats={chats}
            pathname={pathname}
            onChatSelect={handleChatSelect}
          />
        </nav>
      </>
    );
  }

  // Desktop: fixed sidebar
  return (
    <nav
      ref={sidebarRef}
      className="flex h-full w-64 flex-col border-r bg-sidebar"
      role="navigation"
      aria-label="Chat navigation"
    >
      <SidebarContent chats={chats} pathname={pathname} />
    </nav>
  );
}

function SidebarContent({
  chats,
  pathname,
  onChatSelect,
}: {
  chats: ChatEntry[];
  pathname: string;
  onChatSelect?: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between p-4">
        <h2 className="text-sm font-semibold text-sidebar-foreground">Chats</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            // TODO: Create new chat via API when backend supports POST /api/context/chats
          }}
          aria-label="Create new chat"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-2" role="list" aria-label="Chat list">
          {chats.map((chat) => {
            const isActive = pathname === `/chat/${chat.id}`;
            return (
              <Link
                key={chat.id}
                href={`/chat/${chat.id}`}
                role="listitem"
                aria-current={isActive ? "page" : undefined}
                onClick={onChatSelect}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{chat.title}</span>
                <span className="ml-auto text-xs text-muted-foreground" aria-label={`Updated ${chat.updatedAt}`}>
                  {chat.updatedAt}
                </span>
              </Link>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t p-2 mt-2">
        <Link
          href="/settings"
          onClick={onChatSelect}
          className="flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">Settings</span>
        </Link>
      </div>
    </>
  );
}
