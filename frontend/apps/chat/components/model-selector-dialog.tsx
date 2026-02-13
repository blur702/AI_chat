"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ScrollArea,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Skeleton,
  cn,
} from "@workstation/ui";
import {
  Check,
  Download,
  HardDrive,
  Loader2,
  MemoryStick,
  Trash2,
  Upload,
  Unplug,
} from "lucide-react";
import { useModelSwitcher, useWebSocket, useAuth } from "@workstation/api/hooks";

interface ModelSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null) return "";
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

export function ModelSelectorDialog({ open, onOpenChange }: ModelSelectorDialogProps) {
  const { token } = useAuth();
  const {
    models,
    runningModels,
    remoteModels,
    activeModel,
    loading,
    actionLoading,
    pullProgress,
    error,
    setActiveModel,
    loadModel,
    unloadModel,
    pullModel,
    deleteModel,
    refresh,
    isModelRunning,
    getModelVramMb,
  } = useModelSwitcher();

  const { subscribe } = useWebSocket({ token, autoConnect: true });

  // Refresh on dialog open
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Subscribe to model-related WebSocket events
  useEffect(() => {
    const unsubs = [
      subscribe("model_loaded", () => refresh()),
      subscribe("model_unloaded", () => refresh()),
      subscribe("model_pulling", () => refresh()),
      subscribe("model_loading", () => refresh()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe, refresh]);

  const vramModelCount = runningModels.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Model Selector</DialogTitle>
          <DialogDescription>
            Browse, load, and manage LLM models
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {pullProgress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Pulling {pullProgress.modelName}...</span>
              <span>{Math.round(pullProgress.percent)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${pullProgress.percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {pullProgress.status}
            </p>
          </div>
        )}

        <Tabs defaultValue="local" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="local" className="flex-1">
              Local ({models.length})
            </TabsTrigger>
            <TabsTrigger value="available" className="flex-1">
              Available ({remoteModels.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[380px]">
              {loading ? (
                <div className="space-y-3 pr-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : models.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No local models found. Pull one from the Available tab.
                </p>
              ) : (
                <div className="space-y-2 pr-4">
                  {models.map((model) => {
                    const running = isModelRunning(model.name);
                    const isActive = activeModel === model.name;
                    const vramMb = getModelVramMb(model.name);
                    const isLoading = actionLoading === model.name;

                    return (
                      <div
                        key={model.name}
                        className={cn(
                          "rounded-lg border p-3 transition-colors cursor-pointer hover:bg-muted/50",
                          isActive && "border-primary bg-primary/5"
                        )}
                        onClick={() => setActiveModel(model.name)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate">
                                {model.name}
                              </span>
                              {isActive && (
                                <Badge variant="default" className="h-5 text-[10px] gap-1">
                                  <Check className="h-3 w-3" /> Active
                                </Badge>
                              )}
                              {running && (
                                <Badge className="h-5 text-[10px] bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/25">
                                  In VRAM
                                </Badge>
                              )}
                            </div>
                            {model.description && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">
                                {model.description}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              {model.size && (
                                <span className="flex items-center gap-1">
                                  <HardDrive className="h-3 w-3" />
                                  {formatBytes(model.size)}
                                </span>
                              )}
                              {vramMb !== null && (
                                <span className="flex items-center gap-1">
                                  <MemoryStick className="h-3 w-3" />
                                  {vramMb} MB VRAM
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <TooltipProvider delayDuration={300}>
                              {running ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      disabled={isLoading}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        unloadModel(model.name);
                                      }}
                                    >
                                      {isLoading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Unplug className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Unload from VRAM</TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      disabled={isLoading}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        loadModel(model.name);
                                      }}
                                    >
                                      {isLoading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Upload className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Load into VRAM</TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    disabled={isLoading || running}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteModel(model.name);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {running ? "Unload first to delete" : "Delete model"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="available" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[380px]">
              {remoteModels.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  All popular models are already downloaded.
                </p>
              ) : (
                <div className="space-y-2 pr-4">
                  {remoteModels.map((model) => {
                    const isPulling =
                      (pullProgress?.modelName === model.name ||
                       pullProgress?.modelName.startsWith(model.name + ":")) ?? false;

                    return (
                      <div
                        key={model.name}
                        className="rounded-lg border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-sm">
                              {model.name}
                            </span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {model.description}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {model.sizes.map((size) => (
                                <Badge
                                  key={size}
                                  variant="outline"
                                  className="h-5 text-[10px] cursor-pointer hover:bg-muted"
                                  onClick={() =>
                                    pullModel(`${model.name}:${size}`)
                                  }
                                >
                                  {size}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 shrink-0"
                                  disabled={isPulling}
                                  onClick={() =>
                                    pullModel(
                                      model.sizes.length === 1
                                        ? `${model.name}:${model.sizes[0]}`
                                        : model.name
                                    )
                                  }
                                >
                                  {isPulling ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {isPulling ? "Pulling..." : "Pull model"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="border-t pt-2 text-xs text-muted-foreground">
          {vramModelCount} model{vramModelCount !== 1 ? "s" : ""} loaded in VRAM
        </div>
      </DialogContent>
    </Dialog>
  );
}
