"use client";

import { Badge, cn } from "@workstation/ui";
import {
  Activity,
  Cpu,
  HardDrive,
  Layers,
  MessageSquare,
  Wrench,
} from "lucide-react";
import type { KernelMetrics } from "@workstation/api/types";

interface QuickStatsProps {
  metrics: KernelMetrics | null;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "N/A";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StatItemProps {
  icon: typeof Activity;
  label: string;
  value: string | number;
  variant?: "default" | "success" | "warning";
}

function StatItem({ icon: Icon, label, value, variant = "default" }: StatItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card p-3">
      <Icon
        className={cn(
          "h-5 w-5 shrink-0",
          variant === "success" && "text-green-500",
          variant === "warning" && "text-yellow-500",
          variant === "default" && "text-muted-foreground"
        )}
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

export function QuickStats({ metrics }: QuickStatsProps) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[72px] rounded-md border bg-card animate-pulse"
          />
        ))}
      </div>
    );
  }

  const healthRatio = `${metrics.healthy_service_count}/${metrics.registered_service_count}`;
  const allHealthy =
    metrics.healthy_service_count === metrics.registered_service_count;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatItem
        icon={Activity}
        label="Uptime"
        value={formatUptime(metrics.uptime_seconds)}
      />
      <StatItem
        icon={Layers}
        label="Services"
        value={healthRatio}
        variant={allHealthy ? "success" : "warning"}
      />
      <StatItem
        icon={Wrench}
        label="Tools"
        value={metrics.total_registered_tools}
      />
      <StatItem
        icon={MessageSquare}
        label="Conversations"
        value={metrics.active_conversations}
      />
      <StatItem
        icon={Cpu}
        label="Queue Processors"
        value={metrics.active_queue_processors}
      />
      <StatItem
        icon={HardDrive}
        label="Redis Memory"
        value={formatBytes(metrics.redis_memory_bytes)}
      />
    </div>
  );
}
