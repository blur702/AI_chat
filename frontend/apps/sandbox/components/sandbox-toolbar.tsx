"use client";

import Link from "next/link";
import { Button, useBreakpoint, ThemeToggle } from "@workstation/ui";
import { Code2, FolderOpen, Play, Settings, MessageSquare, ListChecks, History } from "lucide-react";

interface SandboxToolbarProps {
  onFilesClick?: () => void;
  onRunClick?: () => void;
  onChatClick?: () => void;
  onActionsClick?: () => void;
  onHistoryClick?: () => void;
  onSettingsClick?: () => void;
  pendingActionsCount?: number;
}

export function SandboxToolbar({
  onFilesClick,
  onRunClick,
  onChatClick,
  onActionsClick,
  onHistoryClick,
  onSettingsClick,
  pendingActionsCount = 0,
}: SandboxToolbarProps) {
  const { isMobile } = useBreakpoint();

  return (
    <div className="flex items-center gap-1 md:gap-2 border-b bg-muted/30 px-2 md:px-3 py-1.5 overflow-x-auto">
      <Link href="/projects" className="flex items-center gap-2 mr-2 md:mr-4 shrink-0">
        <Code2 className="h-5 w-5 text-primary" />
        {!isMobile && (
          <span className="text-sm font-semibold">AI Sandbox</span>
        )}
      </Link>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onFilesClick}>
        <FolderOpen className="h-4 w-4" />
        {!isMobile && "Files"}
      </Button>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onRunClick}>
        <Play className="h-4 w-4" />
        {!isMobile && "Run"}
      </Button>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0 relative" onClick={onActionsClick}>
        <ListChecks className="h-4 w-4" />
        {!isMobile && "Actions"}
        {pendingActionsCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {pendingActionsCount > 9 ? "9+" : pendingActionsCount}
          </span>
        )}
      </Button>

      {!isMobile && (
        <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onHistoryClick}>
          <History className="h-4 w-4" />
          History
        </Button>
      )}

      <div className="flex-1" />

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={onChatClick}>
        <MessageSquare className="h-4 w-4" />
        {!isMobile && "AI Chat"}
      </Button>

      <ThemeToggle />

      <Button variant="ghost" size="icon" aria-label="Settings" onClick={onSettingsClick}>
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}
