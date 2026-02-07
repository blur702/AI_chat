"use client";

import { Badge, cn } from "@workstation/ui";
import { Cpu, Wifi, WifiOff } from "lucide-react";

export function SystemStatusBar() {
  // In production, these would come from useResources() and useWebSocket()
  // Using static values for now
  const connected = true;
  const vramUsage = "33%";

  return (
    <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-1.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {connected ? (
            <Wifi className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className="text-xs text-muted-foreground">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            VRAM: {vramUsage}
          </span>
        </div>
        <Badge variant="outline" className="h-5 text-[10px]">
          AI Workstation
        </Badge>
      </div>
    </div>
  );
}
