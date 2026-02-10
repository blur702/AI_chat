"use client";

import { Badge, cn } from "@workstation/ui";
import { Cpu, GitBranch, MemoryStick, Monitor, Wifi, WifiOff } from "lucide-react";
import { useEffect } from "react";
import { useResources, useWebSocket, useAuth } from "@workstation/api/hooks";

function usageColor(percent: number | null): string {
  if (percent === null) return "text-muted-foreground";
  if (percent > 80) return "text-red-500";
  if (percent > 50) return "text-yellow-500";
  return "text-muted-foreground";
}

function pct(value: number | null | undefined, fallback = "N/A"): string {
  if (value === null || value === undefined) return fallback;
  return `${Math.round(value)}%`;
}

export function SandboxStatusBar() {
  const { token } = useAuth();
  const { vramStats, systemStats, loading, refresh } = useResources(5000);
  const { status, subscribe } = useWebSocket({ token, autoConnect: true });

  const connected = status === "connected";

  // Subscribe to real-time resource updates
  useEffect(() => {
    const unsubscribe = subscribe("resource_updated", () => {
      refresh();
    });
    return unsubscribe;
  }, [subscribe, refresh]);

  const vramPercent = vramStats?.utilization_percent ?? null;
  const cpuPercent = systemStats?.cpu_percent ?? null;
  const ramPercent = systemStats?.ram_percent ?? null;
  const gpuCount = vramStats?.gpu_count ?? null;

  const loadingText = loading ? "..." : undefined;

  return (
    <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">main</span>
        </div>
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
          <Cpu className={cn("h-3.5 w-3.5", usageColor(cpuPercent))} />
          <span className={cn("text-xs", usageColor(cpuPercent))}>
            CPU: {loadingText ?? pct(cpuPercent)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <MemoryStick className={cn("h-3.5 w-3.5", usageColor(ramPercent))} />
          <span className={cn("text-xs", usageColor(ramPercent))}>
            RAM: {loadingText ?? pct(ramPercent)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Monitor className={cn("h-3.5 w-3.5", usageColor(vramPercent))} />
          <span className={cn("text-xs", usageColor(vramPercent))}>
            VRAM: {loadingText ?? pct(vramPercent)}
            {gpuCount !== null && gpuCount > 0 && ` (${gpuCount} GPU${gpuCount > 1 ? "s" : ""})`}
          </span>
        </div>
        <Badge variant="outline" className="h-5 text-[10px]">
          Sandbox
        </Badge>
      </div>
    </div>
  );
}
