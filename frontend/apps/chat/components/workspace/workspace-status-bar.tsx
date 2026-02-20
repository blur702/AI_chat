"use client";

import { Badge, cn } from "@workstation/ui";
import { Cpu, GitBranch, HardDrive, MemoryStick, Monitor, Wifi, WifiOff, Wrench, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
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

interface LastToolExecution {
  toolName: string;
  success: boolean;
  timestamp: number;
}

const LAST_TOOL_KEY = "tools:last-execution";

function useLastToolExecution(): LastToolExecution | null {
  const [data, setData] = useState<LastToolExecution | null>(null);

  useEffect(() => {
    // Read initial value
    try {
      const raw = localStorage.getItem(LAST_TOOL_KEY);
      if (raw) setData(JSON.parse(raw));
    } catch { /* ignore */ }

    // Listen for storage events from other components
    const handler = (e: StorageEvent) => {
      if (e.key === LAST_TOOL_KEY) {
        try {
          setData(e.newValue ? JSON.parse(e.newValue) : null);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", handler);

    // Also poll for same-window updates
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem(LAST_TOOL_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as LastToolExecution;
          setData((prev) =>
            prev?.timestamp !== parsed.timestamp ? parsed : prev
          );
        }
      } catch { /* ignore */ }
    }, 2000);

    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

  return data;
}

export function WorkspaceStatusBar() {
  const lastToolExecution = useLastToolExecution();
  const { token, userId } = useAuth();
  const { vramStats, systemStats, loading, refresh, preference, fetchPreference } = useResources(5000);
  const { status, subscribe } = useWebSocket({ token, autoConnect: true });

  const connected = status === "connected";

  // Subscribe to real-time resource updates
  useEffect(() => {
    const unsubscribe = subscribe("resource_updated", () => {
      refresh();
    });
    return unsubscribe;
  }, [subscribe, refresh]);

  // Fetch offload preference
  useEffect(() => {
    if (userId) fetchPreference(userId);
  }, [userId, fetchPreference]);

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
        {lastToolExecution && (
          <div className="flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            {lastToolExecution.success ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-destructive" />
            )}
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
              {lastToolExecution.toolName}
            </span>
          </div>
        )}
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
        <div className="flex items-center gap-1.5" title={`Offload: ${preference.replace(/_/g, " ")}`}>
          <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground capitalize">
            {preference === "ask_each_time" ? "Ask" : preference === "always_offload" ? "Auto-offload" : "No offload"}
          </span>
        </div>
        <Badge variant="outline" className="h-5 text-[10px]">
          Workspace
        </Badge>
      </div>
    </div>
  );
}
