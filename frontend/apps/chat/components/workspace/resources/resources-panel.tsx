"use client";

import { useState, useEffect } from "react";
import { Button, Badge, ScrollArea, cn } from "@workstation/ui";
import {
  AlertCircle,
  ArrowUpDown,
  Cpu,
  Filter,
  HardDrive,
  Loader2,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { useResources } from "@workstation/api/hooks";
import type {
  ResourceSortField,
  ResourceSortOrder,
  ResourceStatusFilter,
} from "@workstation/api/hooks";
import { useAuth } from "@workstation/api/hooks";
import type {
  OffloadDecision,
  OffloadDecisionResponse,
  PreemptionCheckResponse,
} from "@workstation/api/types";
import { ResourceCard } from "./resource-card";
import { OffloadDialog } from "./offload-dialog";
import { PreemptionDialog } from "./preemption-dialog";

interface ResourcesPanelProps {
  onClose?: () => void;
}

const SORT_OPTIONS: { value: ResourceSortField; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "vram_mb", label: "VRAM" },
  { value: "resource_id", label: "Name" },
  { value: "status", label: "Status" },
  { value: "last_used_at", label: "Last Used" },
];

const STATUS_FILTER_OPTIONS: { value: ResourceStatusFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "loaded", label: "Loaded" },
  { value: "loading", label: "Loading" },
  { value: "active", label: "Active" },
  { value: "cpu_offloaded", label: "Offloaded" },
  { value: "error", label: "Error" },
];

function formatBytes(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function ResourcesPanel({ onClose }: ResourcesPanelProps) {
  const { userId } = useAuth();
  const {
    vramStats,
    systemStats,
    sortedResources,
    loading,
    error,
    actionLoading,
    refresh,
    offloadResource,
    reloadResource,
    checkPreemption,
    preference,
    fetchPreference,
    setPreference,
    sortField,
    sortOrder,
    statusFilter,
    setSortField,
    setSortOrder,
    setStatusFilter,
  } = useResources(10000); // 10s auto-refresh

  // Dialogs
  const [offloadTarget, setOffloadTarget] = useState<string | null>(null);
  const [preemptionState, setPreemptionState] = useState<{
    resourceId: string;
    preemptable: string[];
    freeVramMb: number;
    requiredVramMb: number;
  } | null>(null);

  // Fetch preference on mount
  useEffect(() => {
    if (userId) fetchPreference(userId);
  }, [userId, fetchPreference]);

  const handleOffload = (resourceId: string) => {
    setOffloadTarget(resourceId);
  };

  const handleOffloadConfirm = async (
    decision: OffloadDecision,
    remember: boolean
  ) => {
    if (!offloadTarget || !userId) return;
    await offloadResource({
      resource_id: offloadTarget,
      user_id: userId,
      decision,
      remember,
    });
    if (remember) {
      const pref = decision === "offload" ? "always_offload" : "always_cancel";
      await setPreference(userId, pref, true);
    }
  };

  const handleReload = async (resourceId: string) => {
    const resource = sortedResources.find((r) => r.resource_id === resourceId);
    const estimatedVram = resource?.vram_mb ?? 4096;

    try {
      const result: OffloadDecisionResponse = await reloadResource({
        resource_id: resourceId,
        estimated_vram_mb: estimatedVram,
        user_id: userId ?? undefined,
      });

      // If reload failed with preemption suggestions
      if (!result.success && result.preempted_resources && result.preempted_resources.length > 0) {
        const preemptionCheck: PreemptionCheckResponse = await checkPreemption(estimatedVram);
        setPreemptionState({
          resourceId,
          preemptable: preemptionCheck.preemptable_resources,
          freeVramMb: preemptionCheck.free_vram_mb,
          requiredVramMb: estimatedVram,
        });
      }
    } catch {
      // Error already set in hook
    }
  };

  const handlePreempt = async (resourceId: string) => {
    const resource = sortedResources.find((r) => r.resource_id === resourceId);
    const estimatedVram = resource?.vram_mb ?? 4096;

    try {
      const check: PreemptionCheckResponse = await checkPreemption(estimatedVram);
      setPreemptionState({
        resourceId,
        preemptable: check.preemptable_resources,
        freeVramMb: check.free_vram_mb,
        requiredVramMb: estimatedVram,
      });
    } catch {
      // Error already set in hook
    }
  };

  const handlePreemptionConfirm = async (remember: boolean) => {
    if (!preemptionState || !userId) return;
    // Attempt reload which will auto-preempt if preference allows
    if (remember) {
      await setPreference(userId, "always_offload", true);
    }
    await reloadResource({
      resource_id: preemptionState.resourceId,
      estimated_vram_mb: preemptionState.requiredVramMb,
      user_id: userId,
    });
    setPreemptionState(null);
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  const vramPercent = vramStats
    ? Math.round(vramStats.utilization_percent)
    : 0;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-semibold">Resources</h2>
          <Badge variant="secondary" className="h-4 text-[9px] px-1">
            {sortedResources.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* VRAM gauge */}
      {vramStats && (
        <div className="px-3 py-2 border-b space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">
              GPU VRAM ({vramStats.gpu_count} GPU{vramStats.gpu_count !== 1 ? "s" : ""})
            </span>
            <span className="font-medium">
              {formatBytes(vramStats.used_mb)} / {formatBytes(vramStats.total_mb)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                vramPercent > 90
                  ? "bg-red-500"
                  : vramPercent > 70
                  ? "bg-orange-500"
                  : "bg-green-500"
              )}
              style={{ width: `${vramPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{formatBytes(vramStats.free_mb)} free</span>
            <span>{vramPercent}% used</span>
          </div>
        </div>
      )}

      {/* System stats */}
      {systemStats && (
        <div className="px-3 py-1.5 border-b flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Cpu className="h-3 w-3" />
            CPU {systemStats.cpu_percent.toFixed(0)}%
          </div>
          <div>
            RAM {formatBytes(systemStats.ram_used_mb)} / {formatBytes(systemStats.ram_total_mb)} ({systemStats.ram_percent.toFixed(0)}%)
          </div>
        </div>
      )}

      {/* Sort & Filter controls */}
      <div className="px-3 py-1.5 border-b flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ArrowUpDown className="h-3 w-3" />
        </div>
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as ResourceSortField)}
          className="h-6 rounded border bg-background px-1.5 text-[10px]"
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={toggleSortOrder}
          title={sortOrder === "asc" ? "Ascending" : "Descending"}
        >
          <ArrowUpDown className={cn("h-3 w-3", sortOrder === "desc" && "rotate-180")} />
        </Button>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-2">
          <Filter className="h-3 w-3" />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ResourceStatusFilter)}
          className="h-6 rounded border bg-background px-1.5 text-[10px]"
          aria-label="Filter by status"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Preference indicator */}
        <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <Settings2 className="h-3 w-3" />
          <span className="capitalize">{preference.replace(/_/g, " ")}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Resource list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {loading && sortedResources.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading resources...
            </div>
          ) : sortedResources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-1">
              <HardDrive className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">No resources loaded</p>
              <p className="text-[10px] text-muted-foreground/70">
                {statusFilter
                  ? "No resources match the current filter."
                  : "Resources will appear here when models are loaded."}
              </p>
            </div>
          ) : (
            sortedResources.map((resource) => (
              <ResourceCard
                key={resource.resource_id}
                resource={resource}
                onOffload={handleOffload}
                onReload={handleReload}
                onPreempt={handlePreempt}
                actionLoading={actionLoading}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Offload Dialog */}
      <OffloadDialog
        open={offloadTarget !== null}
        onClose={() => setOffloadTarget(null)}
        resourceId={offloadTarget}
        onConfirm={handleOffloadConfirm}
        loading={actionLoading}
      />

      {/* Preemption Dialog */}
      <PreemptionDialog
        open={preemptionState !== null}
        onClose={() => setPreemptionState(null)}
        resourceId={preemptionState?.resourceId ?? null}
        preemptableResources={preemptionState?.preemptable ?? []}
        freeVramMb={preemptionState?.freeVramMb ?? 0}
        requiredVramMb={preemptionState?.requiredVramMb ?? 0}
        onConfirm={handlePreemptionConfirm}
        loading={actionLoading}
      />
    </div>
  );
}
