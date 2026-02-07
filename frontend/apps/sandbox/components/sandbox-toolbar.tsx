"use client";

import Link from "next/link";
import { Button, useBreakpoint, ThemeToggle } from "@workstation/ui";
import { Code2, FolderOpen, Play, Settings, MessageSquare } from "lucide-react";

export function SandboxToolbar() {
  const { isMobile } = useBreakpoint();

  return (
    <div className="flex items-center gap-1 md:gap-2 border-b bg-muted/30 px-2 md:px-3 py-1.5 overflow-x-auto">
      <Link href="/projects" className="flex items-center gap-2 mr-2 md:mr-4 shrink-0">
        <Code2 className="h-5 w-5 text-primary" />
        {!isMobile && (
          <span className="text-sm font-semibold">AI Sandbox</span>
        )}
      </Link>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0">
        <FolderOpen className="h-4 w-4" />
        {!isMobile && "Files"}
      </Button>

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0">
        <Play className="h-4 w-4" />
        {!isMobile && "Run"}
      </Button>

      <div className="flex-1" />

      <Button variant="ghost" size="sm" className="gap-1.5 shrink-0">
        <MessageSquare className="h-4 w-4" />
        {!isMobile && "AI Chat"}
      </Button>

      <ThemeToggle />

      <Button variant="ghost" size="icon" aria-label="Settings">
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}
