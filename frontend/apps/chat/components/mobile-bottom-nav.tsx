"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn, useBreakpoint } from "@workstation/ui";
import { Plus, MessageSquare, Settings, Loader2 } from "lucide-react";
import { getClient } from "@workstation/api";

const PROJECT_ID_KEY = "workstation_chat_project_id";

const LINK_ITEMS = [
  { href: "/chat", icon: MessageSquare, label: "Chats" },
  { href: "/settings", icon: Settings, label: "Settings" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const [creating, setCreating] = useState(false);

  const handleNewChat = useCallback(async () => {
    if (creating) return;
    let projectId: string | null = null;
    try {
      projectId = localStorage.getItem(PROJECT_ID_KEY);
    } catch {
      // localStorage may be unavailable
    }
    if (!projectId) return;

    setCreating(true);
    try {
      const res = await getClient().createChat(projectId, "New Chat");
      if (res.id) {
        router.push(`/chat/${res.id}`);
      }
    } catch {
      // Silently fail — sidebar will show the full error experience
    } finally {
      setCreating(false);
    }
  }, [creating, router]);

  if (!isMobile) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-background"
      style={{ minHeight: 56 }}
      aria-label="Mobile navigation"
    >
      <button
        onClick={handleNewChat}
        disabled={creating}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors min-h-[56px] text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {creating ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="h-5 w-5" aria-hidden="true" />
        )}
        <span>New Chat</span>
      </button>

      {LINK_ITEMS.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={label}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors min-h-[56px]",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
