"use client";

import Link from "next/link";
import { Button } from "@workstation/ui";
import { Code2, FolderOpen, Play, Settings, MessageSquare } from "lucide-react";

export function SandboxToolbar() {
  return (
    <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
      <Link href="/projects" className="flex items-center gap-2 mr-4">
        <Code2 className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold">AI Sandbox</span>
      </Link>

      <Button variant="ghost" size="sm" className="gap-1.5">
        <FolderOpen className="h-3.5 w-3.5" />
        Files
      </Button>

      <Button variant="ghost" size="sm" className="gap-1.5">
        <Play className="h-3.5 w-3.5" />
        Run
      </Button>

      <div className="flex-1" />

      <Button variant="ghost" size="sm" className="gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        AI Chat
      </Button>

      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Settings">
        <Settings className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
