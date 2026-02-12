"use client";

import { Badge, Button, cn } from "@workstation/ui";
import {
  Cpu,
  HardDrive,
  Lock,
  MoreVertical,
  RefreshCw,
  Unlock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@workstation/ui";
import type { Resource } from "@workstation/api/types";

interface ResourceCardProps {
  resource: Resource;
  onOffload: (resourceId: string) => void;
  onReload: (resourceId: string) => void;
  onPreempt: (resourceId: string) => void;
  actionLoading: boolean;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  loaded: { bg: "bg-green-500/10", text: "text-green-600", label: "Loaded" },
  loading: { bg: "bg-blue-500/10", text: "text-blue-600", label: "Loading" },
  active: { bg: "bg-green-500/10", text: "text-green-600", label: "Active" },
  cpu_offloaded: { bg: "bg-yellow-500/10", text: "text-yellow-600", label: "CPU Offloaded" },
  unloading: { bg: "bg-orange-500/10", text: "text-orange-600", label: "Unloading" },
  error: { bg: "bg-red-500/10", text: "text-red-600", label: "Error" },
};

function formatLastUsed(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}

export function ResourceCard({
  resource,
  onOffload,
  onReload,
  onPreempt,
  actionLoading,
}: ResourceCardProps) {
  const style = STATUS_STYLES[resource.status] ?? {
    bg: "bg-muted",
    text: "text-muted-foreground",
    label: resource.status,
  };

  const isOffloaded = resource.status === "cpu_offloaded";
  const isLoaded = resource.status === "loaded" || resource.status === "active";

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isOffloaded ? (
            <Cpu className="h-4 w-4 text-yellow-600 shrink-0" />
          ) : (
            <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{resource.resource_id}</p>
            <p className="text-[10px] text-muted-foreground">{resource.resource_type}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Badge
            variant="outline"
            className={cn("text-[10px] capitalize", style.bg, style.text)}
          >
            {style.label}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={actionLoading}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isLoaded && (
                <DropdownMenuItem onClick={() => onOffload(resource.resource_id)}>
                  <ArrowDownToLine className="mr-2 h-3.5 w-3.5" />
                  Offload to CPU
                </DropdownMenuItem>
              )}
              {isOffloaded && (
                <DropdownMenuItem onClick={() => onReload(resource.resource_id)}>
                  <ArrowUpFromLine className="mr-2 h-3.5 w-3.5" />
                  Reload to GPU
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onPreempt(resource.resource_id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Preempt
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div>
          <span className="text-muted-foreground">VRAM</span>
          <p className="font-medium">
            {resource.vram_mb != null ? `${resource.vram_mb} MB` : "N/A"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Priority</span>
          <p className="font-medium">{resource.priority}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Last Used</span>
          <p className="font-medium">{formatLastUsed(resource.last_used_at)}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {resource.user_locked ? (
          <>
            <Lock className="h-3 w-3" />
            <span>Locked</span>
          </>
        ) : (
          <>
            <Unlock className="h-3 w-3" />
            <span>Unlocked</span>
          </>
        )}
      </div>
    </div>
  );
}
