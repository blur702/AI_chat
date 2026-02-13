"use client";

import { Badge, cn } from "@workstation/ui";
import { Zap, AlertTriangle, AlertCircle, Info, Loader2 } from "lucide-react";
import { useEventStats } from "@workstation/api/hooks";

const severityConfig: Record<string, { icon: typeof Info; color: string }> = {
  info: { icon: Info, color: "text-blue-500" },
  warning: { icon: AlertTriangle, color: "text-yellow-500" },
  error: { icon: AlertCircle, color: "text-red-500" },
  critical: { icon: AlertCircle, color: "text-red-700" },
};

export function EventStats() {
  const { stats, loading, error } = useEventStats();

  if (loading) {
    return (
      <div className="rounded-md border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Event Statistics</span>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-md border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Event Statistics</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {error || "No event data available"}
        </p>
      </div>
    );
  }

  const severities = Object.entries(stats.by_severity).sort(
    ([, a], [, b]) => b - a
  );
  const topTypes = Object.entries(stats.by_type)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Event Statistics</span>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {stats.total.toLocaleString()} total
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* By severity */}
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">
            By Severity
          </p>
          <div className="space-y-1.5">
            {severities.map(([severity, count]) => {
              const config = severityConfig[severity] ?? severityConfig.info;
              const Icon = config.icon;
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={severity} className="flex items-center gap-2">
                  <Icon className={cn("h-3 w-3 shrink-0", config.color)} />
                  <span className="text-xs capitalize flex-1">{severity}</span>
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        severity === "critical" && "bg-red-700",
                        severity === "error" && "bg-red-500",
                        severity === "warning" && "bg-yellow-500",
                        severity === "info" && "bg-blue-500"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-8 text-right">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* By type */}
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">
            Top Event Types
          </p>
          <div className="space-y-1.5">
            {topTypes.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="text-xs truncate flex-1">{type}</span>
                <Badge variant="outline" className="h-4 text-[9px] shrink-0">
                  {count}
                </Badge>
              </div>
            ))}
            {topTypes.length === 0 && (
              <p className="text-xs text-muted-foreground">No events recorded</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
