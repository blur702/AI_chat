"use client";

import Link from "next/link";
import { cn, useBreakpoint } from "@workstation/ui";
import { FolderOpen, Play, MessageSquare, Settings } from "lucide-react";

const NAV_ITEMS = [
  { href: "/projects", icon: FolderOpen, label: "Files" },
  { href: "#run", icon: Play, label: "Run" },
  { href: "#chat", icon: MessageSquare, label: "Chat" },
  { href: "/settings", icon: Settings, label: "Settings" },
] as const;

export function MobileBottomNav() {
  const { isMobile } = useBreakpoint();

  if (!isMobile) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-background"
      style={{ minHeight: 56 }}
      aria-label="Mobile navigation"
    >
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => (
        <Link
          key={label}
          href={href}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors min-h-[56px]",
            "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
