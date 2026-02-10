"use client";

import { Button, cn } from "@workstation/ui";
import { RefreshCw } from "lucide-react";

interface RefreshControlProps {
  onRefresh: () => void;
  loading: boolean;
  lastUpdated: Date | null;
  autoRefreshEnabled: boolean;
  onAutoRefreshChange: (enabled: boolean) => void;
  autoRefreshInterval: number;
  onIntervalChange: (ms: number) => void;
}

const INTERVAL_OPTIONS = [
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
  { label: "30s", value: 30000 },
  { label: "60s", value: 60000 },
];

export function RefreshControl({
  onRefresh,
  loading,
  lastUpdated,
  autoRefreshEnabled,
  onAutoRefreshChange,
  autoRefreshInterval,
  onIntervalChange,
}: RefreshControlProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={loading}
      >
        <RefreshCw
          className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")}
        />
        Refresh
      </Button>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={autoRefreshEnabled}
          onChange={(e) => onAutoRefreshChange(e.target.checked)}
          className="rounded border-input"
        />
        Auto-refresh
      </label>

      {autoRefreshEnabled && (
        <select
          value={autoRefreshInterval}
          onChange={(e) => onIntervalChange(Number(e.target.value))}
          className="h-8 rounded-md border bg-background px-2 text-xs"
          aria-label="Auto-refresh interval"
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {lastUpdated && (
        <span className="text-[10px] text-muted-foreground ml-auto">
          Updated {lastUpdated.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
