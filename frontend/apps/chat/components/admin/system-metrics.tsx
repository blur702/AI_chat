"use client";

import { cn } from "@workstation/ui";
import type { KernelMetrics } from "@workstation/api/types";

interface SystemMetricsProps {
  metrics: KernelMetrics | null;
}

interface MetricCardProps {
  label: string;
  value: number;
  max: number;
  unit?: string;
  colorClass?: string;
}

function MetricCard({ label, value, max, unit, colorClass }: MetricCardProps) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor =
    colorClass ??
    (percent > 80
      ? "bg-red-500"
      : percent > 50
        ? "bg-yellow-500"
        : "bg-green-500");

  return (
    <div className="rounded-md border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">
          {value}
          {unit && <span className="text-xs text-muted-foreground ml-0.5">{unit}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>{max}{unit ? ` ${unit}` : ""}</span>
      </div>
    </div>
  );
}

export function SystemMetrics({ metrics }: SystemMetricsProps) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[100px] rounded-md border bg-card animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">System Metrics</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          label="Healthy Services"
          value={metrics.healthy_service_count}
          max={metrics.registered_service_count}
        />
        <MetricCard
          label="Event Subscribers"
          value={metrics.total_subscriber_count}
          max={Math.max(metrics.total_subscriber_count, 50)}
        />
        <MetricCard
          label="Registered Tools"
          value={metrics.total_registered_tools}
          max={Math.max(metrics.total_registered_tools, 20)}
        />
        <MetricCard
          label="Active Conversations"
          value={metrics.active_conversations}
          max={Math.max(metrics.active_conversations, 10)}
        />
        <MetricCard
          label="Queue Processors"
          value={metrics.active_queue_processors}
          max={Math.max(metrics.active_queue_processors, 10)}
        />
        <MetricCard
          label="Job Queue Size"
          value={metrics.queue_size}
          max={Math.max(metrics.queue_size, 20)}
        />
      </div>
    </div>
  );
}
