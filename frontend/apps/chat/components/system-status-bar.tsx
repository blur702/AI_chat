"use client";

import { Badge, cn, useBreakpoint } from "@workstation/ui";
import { Bot, Cpu, MemoryStick, Monitor, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useResources, useWebSocket, useAuth, ACTIVE_MODEL_KEY, ACTIVE_MODEL_CHANGE_EVENT } from "@workstation/api/hooks";
import { ModelSelectorDialog } from "./model-selector-dialog";

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

export function SystemStatusBar() {
  const { token } = useAuth();
  const { vramStats, systemStats, loading, refresh } = useResources(5000);
  const { status, subscribe } = useWebSocket({ token, autoConnect: true });
  const { isMobile } = useBreakpoint();
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_MODEL_KEY);
  });

  const connected = status === "connected";

  // Listen for active model changes from same-window custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const model = (e as CustomEvent).detail?.model ?? null;
      setActiveModel(model);
    };
    window.addEventListener(ACTIVE_MODEL_CHANGE_EVENT, handler);
    return () => window.removeEventListener(ACTIVE_MODEL_CHANGE_EVENT, handler);
  }, []);

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
        <button
          onClick={() => setModelDialogOpen(true)}
          className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted transition-colors"
        >
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn(
            "text-muted-foreground truncate max-w-[120px]",
            isMobile ? "text-[10px]" : "text-xs"
          )}>
            {activeModel ? activeModel.split(":")[0] : "No model"}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        {!isMobile && (
          <>
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
          </>
        )}
        <Badge variant="outline" className="h-5 text-[10px]">
          AI Workstation
        </Badge>
      </div>
      <ModelSelectorDialog open={modelDialogOpen} onOpenChange={setModelDialogOpen} />
    </div>
  );
}
