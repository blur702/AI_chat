"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, ScrollArea, cn } from "@workstation/ui";
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

export function ChatSidebar() {
  const pathname = usePathname();
  const [chats] = useState<ChatEntry[]>(MOCK_CHATS);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-sidebar">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-sm font-semibold text-sidebar-foreground">Chats</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            // TODO: Create new chat via API when backend supports POST /api/context/chats
          }}
          aria-label="New chat"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1">
          {chats.map((chat) => {
            const isActive = pathname === `/chat/${chat.id}`;
            return (
              <Link
                key={chat.id}
                href={`/chat/${chat.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span className="truncate">{chat.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {chat.updatedAt}
                </span>
              </Link>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t p-2">
        <Link href="/settings">
          <Button variant="ghost" className="w-full justify-start gap-2">
            <Settings className="h-4 w-4" />
            <span className="text-sm">Settings</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
