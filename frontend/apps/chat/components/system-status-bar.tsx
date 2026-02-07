"use client";

import { Badge, cn, useBreakpoint } from "@workstation/ui";
import { Cpu, Wifi, WifiOff } from "lucide-react";

export function SystemStatusBar() {
  // In production, these would come from useResources() and useWebSocket()
  // Using static values for now
  const connected = true;
  const vramUsage = "33%";
  const { isMobile } = useBreakpoint();

  return (
    <div className={cn(
      "flex items-center justify-between border-t bg-muted/30",
      isMobile ? "px-2 py-1" : "px-4 py-1.5"
    )}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {connected ? (
            <Wifi className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className={cn(
            "text-muted-foreground",
            isMobile ? "text-[10px]" : "text-xs"
          )}>
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {!isMobile && (
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              VRAM: {vramUsage}
            </span>
          </div>
        )}
        <Badge variant="outline" className="h-5 text-[10px]">
          AI Workstation
        </Badge>
      </div>
    </div>
  );
}
