"use client";

import { Badge } from "@workstation/ui";
import { Cpu, GitBranch, Wifi } from "lucide-react";

export function SandboxStatusBar() {
  return (
    <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">main</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wifi className="h-3.5 w-3.5 text-green-500" />
          <span className="text-xs text-muted-foreground">Connected</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">VRAM: 33%</span>
        </div>
        <Badge variant="outline" className="h-5 text-[10px]">
          Sandbox
        </Badge>
      </div>
    </div>
  );
}
