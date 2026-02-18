"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useVramManagement, useAuth } from "@workstation/api/hooks";
import type {
  PerGpuStats,
  RunningModelInfo,
  OllamaModelInfo,
  Resource,
  SystemStats,
} from "@workstation/api/types";
import {
  Badge,
  Button,
  Progress,
  Skeleton,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  cn,
} from "@workstation/ui";
import {
  GripVertical,
  Cpu,
  MemoryStick,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCcw,
  ChevronDown,
  AlertCircle,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function formatSize(bytes?: number | null): string {
  if (bytes == null) return "—";
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

function formatMb(mb?: number | null): string {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function utilizationColor(pct: number): string {
  if (pct < 50) return "bg-green-500/15 text-green-700 dark:text-green-400";
  if (pct < 80) return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
  return "bg-red-500/15 text-red-700 dark:text-red-400";
}

/* ------------------------------------------------------------------ */
/*  DraggableLocalModel                                                */
/* ------------------------------------------------------------------ */

function DraggableLocalModel({
  model,
  onLoad,
  actionLoading,
}: {
  model: OllamaModelInfo;
  onLoad: (name: string) => void;
  actionLoading: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: model.name, data: { type: "local", model } });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const sizeGb = model.size ? model.size / 1024 / 1024 / 1024 : 0;
  const busy = actionLoading === model.name;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm",
        isDragging && "opacity-50",
      )}
    >
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...listeners}
        {...attributes}
        aria-label={`Drag ${model.name}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="flex-1 truncate font-medium">{model.name}</span>

      {sizeGb > 8 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px] shrink-0">
              Multi-GPU
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Spans both GPUs ({formatSize(model.size)})</TooltipContent>
        </Tooltip>
      )}

      <span className="text-xs text-muted-foreground shrink-0">
        {formatSize(model.size)}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            disabled={busy}
            onClick={() => onLoad(model.name)}
          >
            <Zap className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Load model</TooltipContent>
      </Tooltip>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DraggableRunningModel                                              */
/* ------------------------------------------------------------------ */

function DraggableRunningModel({
  model,
  onUnload,
  onOffload,
  actionLoading,
}: {
  model: RunningModelInfo;
  onUnload: (name: string) => void;
  onOffload: (name: string) => void;
  actionLoading: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: model.name, data: { type: "running", model } });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const busy = actionLoading === model.name;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm",
        isDragging && "opacity-50",
      )}
    >
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...listeners}
        {...attributes}
        aria-label={`Drag ${model.name}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="flex-1 truncate font-medium">{model.name}</span>

      <span className="text-xs text-muted-foreground shrink-0">
        {formatMb(model.size_vram ? model.size_vram / 1024 / 1024 : null)}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            disabled={busy}
            onClick={() => onOffload(model.name)}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Offload to RAM</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => onUnload(model.name)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Unload model</TooltipContent>
      </Tooltip>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  GpuCard                                                            */
/* ------------------------------------------------------------------ */

function GpuCard({
  gpu,
  runningModels,
  onUnload,
  onOffload,
  actionLoading,
}: {
  gpu: PerGpuStats;
  runningModels: RunningModelInfo[];
  onUnload: (name: string) => void;
  onOffload: (name: string) => void;
  actionLoading: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `gpu-${gpu.gpu_index}`,
  });

  const pct = gpu.total_mb > 0 ? (gpu.used_mb / gpu.total_mb) * 100 : 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-card p-4 transition-all",
        isOver && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">GPU {gpu.gpu_index}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            {gpu.name}
          </span>
        </div>
        <Badge className={cn("text-[10px]", utilizationColor(gpu.utilization_percent))}>
          {gpu.utilization_percent.toFixed(0)}%
        </Badge>
      </div>

      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>VRAM</span>
        <span>
          {formatMb(gpu.used_mb)} / {formatMb(gpu.total_mb)}
        </span>
      </div>
      <Progress value={pct} className="h-2 mb-3" />

      <div className="space-y-1.5">
        {runningModels.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2 text-center">
            No models loaded — drag a model here
          </p>
        ) : (
          runningModels.map((m) => (
            <DraggableRunningModel
              key={m.name}
              model={m}
              onUnload={onUnload}
              onOffload={onOffload}
              actionLoading={actionLoading}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RamZone                                                            */
/* ------------------------------------------------------------------ */

function RamZone({
  systemStats,
  offloadedResources,
  onReload,
  actionLoading,
}: {
  systemStats: SystemStats | null;
  offloadedResources: Resource[];
  onReload: (resourceId: string, estimatedVramMb: number) => void;
  actionLoading: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "ram" });

  const ramPct = systemStats
    ? (systemStats.ram_used_mb / systemStats.ram_total_mb) * 100
    : 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border bg-card p-4 transition-all",
        isOver && "ring-2 ring-blue-500",
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <MemoryStick className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">System RAM</span>
      </div>

      {systemStats && (
        <>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>RAM</span>
            <span>
              {formatMb(systemStats.ram_used_mb)} / {formatMb(systemStats.ram_total_mb)}
            </span>
          </div>
          <Progress value={ramPct} className="h-2 mb-3" />
        </>
      )}

      <div className="space-y-1.5">
        {offloadedResources.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2 text-center">
            Drag a running model here to offload
          </p>
        ) : (
          offloadedResources.map((r) => (
            <div
              key={r.resource_id}
              className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"
            >
              <ArrowDownToLine className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="flex-1 truncate font-medium">{r.resource_id}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {r.vram_mb ? formatMb(r.vram_mb) : "—"}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    disabled={actionLoading === r.resource_id}
                    onClick={() => onReload(r.resource_id, r.vram_mb ?? 0)}
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reload to GPU</TooltipContent>
              </Tooltip>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HelpSection                                                        */
/* ------------------------------------------------------------------ */

function HelpSection() {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown className="h-3.5 w-3.5" />
        How VRAM management works
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 text-xs text-muted-foreground rounded-md border p-3">
        <p>
          <strong className="text-foreground">VRAM</strong> — Video RAM on
          the GPU. Models must be loaded into VRAM to run inference. Each GPU
          has a fixed amount.
        </p>
        <p>
          <strong className="text-foreground">Offloading</strong> — Moves a
          model from GPU VRAM to system RAM. The model stays in memory and
          can be quickly reloaded without re-downloading.
        </p>
        <p>
          <strong className="text-foreground">Preemption</strong> — When
          loading a model that requires more VRAM than is free, lower-priority
          models are automatically offloaded or unloaded to make room.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/*  Ghost card for DragOverlay                                         */
/* ------------------------------------------------------------------ */

function DragGhost({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-lg opacity-90">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">{name}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Root: VramManagement                                               */
/* ------------------------------------------------------------------ */

export function VramManagement() {
  const {
    gpus,
    vramStats,
    systemStats,
    runningModels,
    localModels,
    offloadedResources,
    loadModel,
    unloadModel,
    offloadToRam,
    reloadFromRam,
    refresh,
    actionLoading,
    loading,
    error,
  } = useVramManagement();

  const { userId } = useAuth();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"local" | "running" | null>(null);

  const onDragStart = useCallback(
    (event: { active: { id: string | number; data: { current?: { type?: string } } } }) => {
      setActiveId(String(event.active.id));
      setActiveType((event.active.data.current?.type as "local" | "running") ?? null);
    },
    [],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (active.data.current?.type === "local" && over?.id && String(over.id).startsWith("gpu-")) {
        loadModel(String(active.id));
      }

      if (active.data.current?.type === "running" && over?.id === "ram") {
        offloadToRam(String(active.id), userId ?? "");
      }

      setActiveId(null);
      setActiveType(null);
    },
    [loadModel, offloadToRam, userId],
  );

  const handleReload = useCallback(
    (resourceId: string, estimatedVramMb: number) => {
      reloadFromRam(resourceId, estimatedVramMb, userId ?? undefined);
    },
    [reloadFromRam, userId],
  );

  // Build a per-GPU mapping of running models.
  // Ollama does not expose which GPU a model resides on, so we assign all
  // running models to GPU 0 (the primary GPU). Secondary GPUs show as empty
  // but still accept drag-and-drop loads.
  const modelsByGpu = useMemo(() => {
    const map = new Map<number, RunningModelInfo[]>();
    for (const gpu of gpus) {
      map.set(gpu.gpu_index, []);
    }
    // Assign all running models to the first GPU
    if (gpus.length > 0) {
      map.set(gpus[0].gpu_index, [...runningModels]);
    }
    return map;
  }, [gpus, runningModels]);

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">VRAM Management</h2>
          <p className="text-xs text-muted-foreground">
            Drag models between GPUs and RAM, or use the action buttons.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCcw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={refresh}
          >
            Retry
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left column: GPUs + RAM */}
          <div className="lg:col-span-2 space-y-4">
            {gpus.length === 0 && !loading && (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                No GPUs detected
              </div>
            )}

            {gpus.map((gpu) => (
              <GpuCard
                key={gpu.gpu_index}
                gpu={gpu}
                runningModels={modelsByGpu.get(gpu.gpu_index) ?? []}
                onUnload={unloadModel}
                onOffload={(name) => offloadToRam(name, userId ?? "")}
                actionLoading={actionLoading}
              />
            ))}

            <RamZone
              systemStats={systemStats}
              offloadedResources={offloadedResources}
              onReload={handleReload}
              actionLoading={actionLoading}
            />
          </div>

          {/* Right column: Available models */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Available Models
            </h3>

            {localModels.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">
                All local models are currently loaded.
              </p>
            ) : (
              <div className="space-y-1.5">
                {localModels.map((m) => (
                  <DraggableLocalModel
                    key={m.name}
                    model={m}
                    onLoad={loadModel}
                    actionLoading={actionLoading}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drag overlay ghost */}
        <DragOverlay>
          {activeId ? <DragGhost name={activeId} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Help section */}
      <HelpSection />
    </div>
  );
}
