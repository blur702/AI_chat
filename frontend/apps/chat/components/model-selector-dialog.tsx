"use client";

import { useEffect, useRef, useState } from "react";
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
  ChevronDown,
  Cloud,
  Wifi,
} from "lucide-react";
import { useModelSwitcher, useWebSocket, useAuth } from "@workstation/api/hooks";

interface ModelSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModelTab = "installed" | "not-installed" | "cloud";

interface PendingSelection {
  name: string;
  source: ModelTab;
}

interface CloudModelInfo {
  name: string;
  provider: string;
  description: string;
  capabilities: string[];
}

const CLOUD_MODELS: CloudModelInfo[] = [
  {
    name: "gpt-4.1",
    provider: "OpenAI",
    description: "Cloud-hosted model for strong reasoning, coding, and analysis.",
    capabilities: ["Reasoning", "Code generation", "Long-context chat"],
  },
  {
    name: "claude-3.7-sonnet",
    provider: "Anthropic",
    description: "Cloud-hosted model focused on coding and structured writing.",
    capabilities: ["Coding", "Planning", "Instruction following"],
  },
  {
    name: "gemini-2.0-flash",
    provider: "Google",
    description: "Cloud-hosted fast multimodal model for responsive interactions.",
    capabilities: ["Fast responses", "Vision", "General chat"],
  },
];

function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null) return "";
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function deriveCapabilities(name: string, description?: string): string[] {
  const haystack = `${name} ${description ?? ""}`.toLowerCase();
  const capabilities: string[] = [];
  if (haystack.includes("code") || haystack.includes("coder")) capabilities.push("Code generation");
  if (haystack.includes("embed")) capabilities.push("Embeddings");
  if (haystack.includes("reason")) capabilities.push("Reasoning");
  if (haystack.includes("vision")) capabilities.push("Vision");
  if (haystack.includes("multi") || haystack.includes("qwen")) capabilities.push("Multilingual");
  if (capabilities.length === 0) capabilities.push("General chat");
  return capabilities.slice(0, 4);
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
  const [activeTab, setActiveTab] = useState<ModelTab>("installed");
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{
    modelName: string;
    percent: number;
    status: string;
  } | null>(null);
  const isMountedRef = useRef(true);
  const applyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { subscribe } = useWebSocket({ token, autoConnect: true });

  const notInstalledModels = remoteModels;
  const vramModelCount = runningModels.length;
  const activeModelDisplay = activeModel ? activeModel.split(":")[0] : "None";

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (applyTimerRef.current) {
        clearInterval(applyTimerRef.current);
        applyTimerRef.current = null;
      }
    };
  }, []);

  // Reset all dialog state when opened
  useEffect(() => {
    if (!open) return;
    void refresh();
    setActiveTab("installed");
    setExpandedKeys({});
    setIsApplying(false);
    setApplyProgress(null);
  }, [open, refresh]);

  // Sync pending selection when activeModel changes (without resetting tabs/expanded)
  useEffect(() => {
    if (!open) return;
    if (activeModel) {
      setPendingSelection({ name: activeModel, source: "installed" });
    } else {
      setPendingSelection(null);
    }
  }, [open, activeModel]);

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

  const canApplyInstalledSelection =
    pendingSelection?.source === "installed" && !isApplying;

  const applyHelperMessage =
    pendingSelection?.source === "not-installed"
      ? "Download the model first from Not Installed, then switch to Installed and Apply."
      : pendingSelection?.source === "cloud"
      ? "Cloud model routing is not configured in this backend yet."
      : null;

  const handleApplySelection = async () => {
    if (!pendingSelection || pendingSelection.source !== "installed" || isApplying) return;

    const selectedName = pendingSelection.name;
    if (!isMountedRef.current) return;
    setIsApplying(true);

    const alreadyRunning = isModelRunning(selectedName);
    if (!alreadyRunning) {
      if (!isMountedRef.current) return;
      setApplyProgress({
        modelName: selectedName,
        percent: 8,
        status: "Starting model load...",
      });

      let simulated = 8;
      applyTimerRef.current = setInterval(() => {
        if (!isMountedRef.current) return;
        simulated = Math.min(simulated + 7, 92);
        setApplyProgress((prev) => {
          if (!prev || prev.modelName !== selectedName) return prev;
          return { ...prev, percent: simulated, status: "Loading model into VRAM..." };
        });
      }, 280);

      let loadedOk = false;
      try {
        loadedOk = await loadModel(selectedName);
      } catch {
        loadedOk = false;
        if (isMountedRef.current) {
          setApplyProgress({
            modelName: selectedName,
            percent: simulated,
            status: "Load failed. Check the error above.",
          });
        }
      } finally {
        if (applyTimerRef.current) {
          clearInterval(applyTimerRef.current);
          applyTimerRef.current = null;
        }
        if (isMountedRef.current && !loadedOk) {
          setIsApplying(false);
        }
      }
      if (!isMountedRef.current) return;

      if (!loadedOk) {
        return;
      }
    }

    if (!isMountedRef.current) return;
    setActiveModel(selectedName);
    setApplyProgress({
      modelName: selectedName,
      percent: 100,
      status: "Model applied.",
    });
    setIsApplying(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Model Selector</DialogTitle>
          <DialogDescription>
            Browse, load, and manage LLM models.
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            Current model: <span className="text-foreground/80">{activeModelDisplay}</span>
          </p>
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

        {applyProgress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Applying {applyProgress.modelName}</span>
              <span>{Math.round(applyProgress.percent)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${applyProgress.percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground truncate">{applyProgress.status}</p>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ModelTab)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="installed" className="flex-1">
              Installed ({models.length})
            </TabsTrigger>
            <TabsTrigger value="not-installed" className="flex-1">
              Not Installed ({notInstalledModels.length})
            </TabsTrigger>
            <TabsTrigger value="cloud" className="flex-1">
              Cloud ({CLOUD_MODELS.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="installed" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[380px]">
              {loading ? (
                <div className="space-y-3 pr-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : models.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No local models found. Pull one from the Not Installed tab.
                </p>
              ) : (
                <div className="space-y-2 pr-4">
                  {models.map((model) => {
                    const running = isModelRunning(model.name);
                    const isActive = activeModel === model.name;
                    const isSelected =
                      pendingSelection?.source === "installed" &&
                      pendingSelection.name === model.name;
                    const vramMb = getModelVramMb(model.name);
                    const isLoading = actionLoading === model.name;
                    const detailKey = `installed:${model.name}`;
                    const capabilities = deriveCapabilities(model.name, model.description);

                    return (
                      <div
                        key={model.name}
                        className={cn(
                          "rounded-lg border p-3 transition-colors cursor-pointer hover:bg-muted/50",
                          isSelected && "border-primary bg-primary/5",
                          !isSelected && isActive && "border-primary/40 bg-primary/5"
                        )}
                        onClick={() => setPendingSelection({ name: model.name, source: "installed" })}
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
                              {isSelected && (
                                <Badge variant="outline" className="h-5 text-[10px]">
                                  Selected
                                </Badge>
                              )}
                              {running && (
                                <Badge className="h-5 text-[10px] bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/25">
                                  In VRAM
                                </Badge>
                              )}
                            </div>
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
                            <button
                              type="button"
                              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(detailKey);
                              }}
                            >
                              <ChevronDown
                                className={cn("h-3.5 w-3.5 transition-transform", expandedKeys[detailKey] && "rotate-180")}
                              />
                              Details & capabilities
                            </button>
                            {expandedKeys[detailKey] && (
                              <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
                                {model.description && (
                                  <p className="text-muted-foreground">{model.description}</p>
                                )}
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {capabilities.map((capability) => (
                                    <Badge key={capability} variant="secondary" className="h-5 text-[10px]">
                                      {capability}
                                    </Badge>
                                  ))}
                                  {model.details?.parameter_size && (
                                    <Badge variant="outline" className="h-5 text-[10px]">
                                      {model.details.parameter_size}
                                    </Badge>
                                  )}
                                  {model.details?.quantization_level && (
                                    <Badge variant="outline" className="h-5 text-[10px]">
                                      {model.details.quantization_level}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
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
                                        void unloadModel(model.name);
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
                                        void loadModel(model.name);
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
                                      if (window.confirm(`Delete "${model.name}"? This requires re-downloading to restore.`)) {
                                        void deleteModel(model.name);
                                      }
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

          <TabsContent value="not-installed" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[380px]">
              {notInstalledModels.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  All popular models are already downloaded.
                </p>
              ) : (
                <div className="space-y-2 pr-4">
                  {notInstalledModels.map((model) => {
                    const isPulling =
                      (pullProgress?.modelName === model.name ||
                       pullProgress?.modelName.startsWith(model.name + ":")) ?? false;
                    const isSelected =
                      pendingSelection?.source === "not-installed" &&
                      pendingSelection.name === model.name;
                    const detailKey = `not-installed:${model.name}`;
                    const capabilities = deriveCapabilities(model.name, model.description);

                    return (
                      <div
                        key={model.name}
                        className={cn("rounded-lg border p-3 cursor-pointer", isSelected && "border-primary bg-primary/5")}
                        onClick={() => setPendingSelection({ name: model.name, source: "not-installed" })}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{model.name}</span>
                              <Badge variant="outline" className="h-5 text-[10px]">
                                Download required
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {model.sizes.map((size) => (
                                <Badge
                                  key={size}
                                  variant="outline"
                                  className="h-5 text-[10px] cursor-pointer hover:bg-muted"
                                  onClick={(e) => { e.stopPropagation(); void pullModel(`${model.name}:${size}`); }}
                                >
                                  {size}
                                </Badge>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(detailKey);
                              }}
                            >
                              <ChevronDown
                                className={cn("h-3.5 w-3.5 transition-transform", expandedKeys[detailKey] && "rotate-180")}
                              />
                              Details & capabilities
                            </button>
                            {expandedKeys[detailKey] && (
                              <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
                                <p className="text-muted-foreground">{model.description}</p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {capabilities.map((capability) => (
                                    <Badge key={capability} variant="secondary" className="h-5 text-[10px]">
                                      {capability}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
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
                                    void pullModel(
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

          <TabsContent value="cloud" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[380px]">
              <div className="space-y-2 pr-4">
                {CLOUD_MODELS.map((model) => {
                  const detailKey = `cloud:${model.name}`;
                  const isSelected =
                    pendingSelection?.source === "cloud" &&
                    pendingSelection.name === model.name;
                  return (
                    <div
                      key={model.name}
                      className={cn("rounded-lg border p-3 cursor-pointer", isSelected && "border-primary bg-primary/5")}
                      onClick={() => setPendingSelection({ name: model.name, source: "cloud" })}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{model.name}</span>
                            <Badge variant="outline" className="h-5 text-[10px] gap-1">
                              <Cloud className="h-3 w-3" />
                              {model.provider}
                            </Badge>
                            <Badge variant="outline" className="h-5 text-[10px] gap-1">
                              <Wifi className="h-3 w-3" />
                              Cloud internet
                            </Badge>
                          </div>
                          <button
                            type="button"
                            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(detailKey);
                            }}
                          >
                            <ChevronDown
                              className={cn("h-3.5 w-3.5 transition-transform", expandedKeys[detailKey] && "rotate-180")}
                            />
                            Details & capabilities
                          </button>
                          {expandedKeys[detailKey] && (
                            <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
                              <p className="text-muted-foreground">{model.description}</p>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {model.capabilities.map((capability) => (
                                  <Badge key={capability} variant="secondary" className="h-5 text-[10px]">
                                    {capability}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {applyHelperMessage && (
          <p className="text-xs text-muted-foreground">{applyHelperMessage}</p>
        )}

        <div className="border-t pt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {vramModelCount} model{vramModelCount !== 1 ? "s" : ""} loaded in VRAM
          </div>
          <Button
            onClick={() => void handleApplySelection()}
            disabled={!canApplyInstalledSelection}
            className="min-w-[96px]"
          >
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Applying
              </>
            ) : (
              "Apply"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
