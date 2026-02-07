"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, useBreakpoint } from "@workstation/ui";
import { Plus, MessageSquare, Settings } from "lucide-react";

const LINK_ITEMS = [
  { href: "/chat", icon: MessageSquare, label: "Chats" },
  { href: "/settings", icon: Settings, label: "Settings" },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const { isMobile } = useBreakpoint();

  if (!isMobile) return null;

  const handleNewChat = () => {
    // TODO: Create new chat via API when backend supports POST /api/context/chats
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-background"
      style={{ minHeight: 56 }}
      aria-label="Mobile navigation"
    >
      <button
        onClick={handleNewChat}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors min-h-[56px] text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
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
