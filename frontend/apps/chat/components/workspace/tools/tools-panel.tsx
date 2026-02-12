"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  Button,
  Input,
  ScrollArea,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Separator,
} from "@workstation/ui";
import {
  X,
  Search,
  Play,
  Star,
  StarOff,
  Pin,
  PinOff,
  Loader2,
  AlertCircle,
  ChevronRight,
  RotateCcw,
  Wrench,
} from "lucide-react";
import type { ToolInfo, ToolExecuteRequest, ToolExecuteResponse } from "@workstation/api/types";
import { ToolParameterForm } from "./tool-parameter-form";
import { ToolExecutionResult } from "./tool-execution-result";

const PINNED_STORAGE_KEY = "tools:pinned";
const FAVORITES_STORAGE_KEY = "tools:favorites";

interface RecentExecution {
  tool: string;
  timestamp: number;
  result: ToolExecuteResponse;
  parameters: Record<string, unknown>;
}

interface ToolsPanelProps {
  tools: ToolInfo[];
  loading: boolean;
  error: string | null;
  onExecute: (request: ToolExecuteRequest) => Promise<ToolExecuteResponse>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  prefillFile?: string | null;
  filterForFile?: boolean;
  initialTool?: string | null;
  onToolExecuted?: (result: ToolExecuteResponse, toolName: string, params: Record<string, unknown>) => void;
  rerunExecution?: { toolName: string; params: Record<string, unknown>; timestamp: number } | null;
}

function loadStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveStringSet(key: string, set: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

export function ToolsPanel({
  tools,
  loading,
  error,
  onExecute,
  onRefresh,
  onClose,
  prefillFile,
  filterForFile,
  initialTool,
  onToolExecuted,
  rerunExecution,
}: ToolsPanelProps) {
  const [search, setSearch] = useState("");
  const [pinned, setPinned] = useState<Set<string>>(() => loadStringSet(PINNED_STORAGE_KEY));
  const [favorites, setFavorites] = useState<Set<string>>(() => loadStringSet(FAVORITES_STORAGE_KEY));
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({});
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<ToolExecuteResponse | null>(null);
  const [recentExecutions, setRecentExecutions] = useState<RecentExecution[]>([]);
  const [activeTab, setActiveTab] = useState("all");

  // Select initial tool if provided
  useEffect(() => {
    if (initialTool && tools.length > 0) {
      const found = tools.find((t) => t.name === initialTool);
      if (found) {
        setSelectedTool(found);
        setActiveTab("execute");
      }
    }
  }, [initialTool, tools]);

  // Handle rerun execution from parent
  const processedRerunRef = useRef<number>(0);
  const pendingRerunRef = useRef<{ toolName: string; params: Record<string, unknown>; timestamp: number } | null>(null);
  const onExecuteRef = useRef(onExecute);
  const onToolExecutedRef = useRef(onToolExecuted);
  onExecuteRef.current = onExecute;
  onToolExecutedRef.current = onToolExecuted;

  const runToolRef = useRef<(tool: ToolInfo, params: Record<string, unknown>, timestamp: number) => Promise<void>>();
  runToolRef.current = async (tool: ToolInfo, params: Record<string, unknown>, timestamp: number) => {
    processedRerunRef.current = timestamp;
    setSelectedTool(tool);
    setParamValues(params);
    setActiveTab("execute");
    setExecuting(true);
    setLastResult(null);
    try {
      const result = await onExecuteRef.current({
        tool_name: tool.name,
        parameters: params,
      });
      setLastResult(result);
      setRecentExecutions((prev) => [
        { tool: tool.name, timestamp: Date.now(), result, parameters: params },
        ...prev.slice(0, 19),
      ]);
      onToolExecutedRef.current?.(result, tool.name, params);
    } catch (err) {
      const failResult: ToolExecuteResponse = {
        tool: tool.name,
        success: false,
        result: null,
        error: err instanceof Error ? err.message : "Execution failed",
        cached: false,
        duration_ms: 0,
        conversation_context: null,
      };
      setLastResult(failResult);
      setRecentExecutions((prev) => [
        { tool: tool.name, timestamp: Date.now(), result: failResult, parameters: params },
        ...prev.slice(0, 19),
      ]);
      onToolExecutedRef.current?.(failResult, tool.name, params);
    } finally {
      setExecuting(false);
      // Execute any rerun that was queued while we were busy
      if (pendingRerunRef.current && pendingRerunRef.current.timestamp > processedRerunRef.current) {
        const pending = pendingRerunRef.current;
        pendingRerunRef.current = null;
        const pendingTool = tools.find((t) => t.name === pending.toolName);
        if (pendingTool) {
          runToolRef.current?.(pendingTool, pending.params, pending.timestamp);
        }
      }
    }
  };

  useEffect(() => {
    if (!rerunExecution || rerunExecution.timestamp <= processedRerunRef.current) return;

    if (executing) {
      pendingRerunRef.current = rerunExecution;
      return;
    }

    const found = tools.find((t) => t.name === rerunExecution.toolName);
    if (!found) return;

    runToolRef.current?.(found, rerunExecution.params, rerunExecution.timestamp);
  }, [rerunExecution, tools, executing]);

  // Pre-fill file path if provided
  useEffect(() => {
    if (prefillFile && selectedTool) {
      const schema = selectedTool.parameters_schema;
      const props = (schema.properties ?? {}) as Record<string, { type?: string }>;
      const fileKeys = Object.keys(props).filter(
        (k) =>
          k.toLowerCase().includes("file") ||
          k.toLowerCase().includes("path")
      );
      if (fileKeys.length > 0) {
        setParamValues((prev) => ({
          ...prev,
          [fileKeys[0]]: prefillFile,
        }));
      }
    }
  }, [prefillFile, selectedTool]);

  const togglePin = useCallback((toolName: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      saveStringSet(PINNED_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((toolName: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      saveStringSet(FAVORITES_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const filteredTools = useMemo(() => {
    let result = tools;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }
    if (filterForFile && prefillFile) {
      result = result.filter((t) => {
        const props = (t.parameters_schema.properties ?? {}) as Record<
          string,
          { type?: string }
        >;
        return Object.keys(props).some(
          (k) =>
            k.toLowerCase().includes("file") ||
            k.toLowerCase().includes("path")
        );
      });
    }
    return result;
  }, [tools, search, filterForFile, prefillFile]);

  const pinnedTools = useMemo(
    () => tools.filter((t) => pinned.has(t.name)),
    [tools, pinned]
  );

  const favoriteTools = useMemo(
    () => tools.filter((t) => favorites.has(t.name)),
    [tools, favorites]
  );

  const handleSelectTool = useCallback((tool: ToolInfo) => {
    setSelectedTool(tool);
    setParamValues({});
    setLastResult(null);
    setActiveTab("execute");
  }, []);

  const handleExecute = useCallback(async () => {
    if (!selectedTool || executing) return;
    setExecuting(true);
    setLastResult(null);
    try {
      const request: ToolExecuteRequest = {
        tool_name: selectedTool.name,
        parameters: paramValues,
      };
      const result = await onExecute(request);
      setLastResult(result);
      setRecentExecutions((prev) => [
        {
          tool: selectedTool.name,
          timestamp: Date.now(),
          result,
          parameters: { ...paramValues },
        },
        ...prev.slice(0, 19),
      ]);
      onToolExecuted?.(result, selectedTool.name, paramValues);
    } catch (err) {
      const failResult: ToolExecuteResponse = {
        tool: selectedTool.name,
        success: false,
        result: null,
        error: err instanceof Error ? err.message : "Execution failed",
        cached: false,
        duration_ms: 0,
        conversation_context: null,
      };
      setLastResult(failResult);
      setRecentExecutions((prev) => [
        { tool: selectedTool.name, timestamp: Date.now(), result: failResult, parameters: { ...paramValues } },
        ...prev.slice(0, 19),
      ]);
      onToolExecuted?.(failResult, selectedTool.name, paramValues);
    } finally {
      setExecuting(false);
    }
  }, [selectedTool, executing, paramValues, onExecute, onToolExecuted]);

  const handleRerun = useCallback(
    (execution: RecentExecution) => {
      const tool = tools.find((t) => t.name === execution.tool);
      if (tool) {
        setSelectedTool(tool);
        setParamValues(execution.parameters);
        setLastResult(null);
        setActiveTab("execute");
      }
    },
    [tools]
  );

  const renderToolItem = (tool: ToolInfo) => (
    <div
      key={tool.name}
      className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent/50 cursor-pointer transition-colors group"
      onClick={() => handleSelectTool(tool)}
    >
      <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{tool.name}</span>
          {tool.required_permissions.length > 0 && (
            <Badge variant="outline" className="h-4 text-[9px] shrink-0">
              {tool.required_permissions.length} perms
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          {tool.description}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePin(tool.name);
          }}
          className="p-1 rounded hover:bg-accent"
          title={pinned.has(tool.name) ? "Unpin" : "Pin"}
        >
          {pinned.has(tool.name) ? (
            <PinOff className="h-3 w-3 text-primary" />
          ) : (
            <Pin className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(tool.name);
          }}
          className="p-1 rounded hover:bg-accent"
          title={favorites.has(tool.name) ? "Unfavorite" : "Favorite"}
        >
          {favorites.has(tool.name) ? (
            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
          ) : (
            <StarOff className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSelectTool(tool);
          }}
          className="p-1 rounded hover:bg-accent"
          title="Execute"
        >
          <Play className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Wrench className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase">Tools</span>
          <Badge variant="secondary" className="h-4 text-[9px]">
            {tools.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onRefresh}
            disabled={loading}
          >
            <RotateCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-3 mx-2 mt-2">
          <TabsTrigger value="all" className="text-[11px]">All</TabsTrigger>
          <TabsTrigger value="execute" className="text-[11px]">Execute</TabsTrigger>
          <TabsTrigger value="recent" className="text-[11px]">Recent</TabsTrigger>
        </TabsList>

        {/* All Tools Tab */}
        <TabsContent value="all" className="flex-1 min-h-0 mt-0">
          <div className="px-2 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search tools..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <ScrollArea className="flex-1 px-2 pb-2">
            <div className="space-y-1.5 pt-2">
              {/* Pinned Section */}
              {pinnedTools.length > 0 && !search.trim() && (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    Pinned
                  </p>
                  {pinnedTools.map(renderToolItem)}
                  <Separator className="my-2" />
                </>
              )}

              {/* Favorites Section */}
              {favoriteTools.length > 0 && !search.trim() && (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    Favorites
                  </p>
                  {favoriteTools.map(renderToolItem)}
                  <Separator className="my-2" />
                </>
              )}

              {/* All / Filtered Tools */}
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {search.trim()
                  ? `Results (${filteredTools.length})`
                  : filterForFile
                    ? "File Tools"
                    : "All Tools"}
              </p>
              {loading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && filteredTools.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No tools found.
                </p>
              )}
              {filteredTools.map(renderToolItem)}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Execute Tab */}
        <TabsContent value="execute" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="flex-1 px-3 pb-3">
            <div className="space-y-3 pt-2">
              {!selectedTool ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Select a tool from the All tab to execute.
                </p>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{selectedTool.name}</h3>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => togglePin(selectedTool.name)}
                          className="p-1 rounded hover:bg-accent"
                        >
                          {pinned.has(selectedTool.name) ? (
                            <PinOff className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                        <button
                          onClick={() => toggleFavorite(selectedTool.name)}
                          className="p-1 rounded hover:bg-accent"
                        >
                          {favorites.has(selectedTool.name) ? (
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                          ) : (
                            <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {selectedTool.description}
                    </p>
                    {selectedTool.required_permissions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {selectedTool.required_permissions.map((perm) => (
                          <Badge key={perm} variant="outline" className="text-[9px] h-4">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <p className="text-xs font-medium mb-2">Parameters</p>
                    <ToolParameterForm
                      schema={selectedTool.parameters_schema}
                      values={paramValues}
                      onChange={setParamValues}
                      prefill={
                        prefillFile
                          ? { file_path: prefillFile, path: prefillFile }
                          : undefined
                      }
                    />
                  </div>

                  <Button
                    onClick={handleExecute}
                    disabled={executing}
                    className="w-full"
                    size="sm"
                  >
                    {executing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Execute
                      </>
                    )}
                  </Button>

                  {lastResult && <ToolExecutionResult result={lastResult} />}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Recent Tab */}
        <TabsContent value="recent" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="flex-1 px-2 pb-2">
            <div className="space-y-2 pt-2">
              {recentExecutions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No recent executions.
                </p>
              ) : (
                recentExecutions.map((exec, i) => (
                  <div
                    key={`${exec.tool}-${exec.timestamp}`}
                    className="rounded-md border p-2 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Wrench className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-medium">{exec.tool}</span>
                        <Badge
                          variant={exec.result.success ? "secondary" : "destructive"}
                          className="h-4 text-[9px]"
                        >
                          {exec.result.success ? "OK" : "FAIL"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(exec.timestamp).toLocaleTimeString()}
                        </span>
                        <button
                          onClick={() => handleRerun(exec)}
                          className="p-0.5 rounded hover:bg-accent"
                          title="Re-run"
                        >
                          <RotateCcw className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {exec.result.duration_ms}ms
                      {Object.keys(exec.parameters).length > 0 &&
                        ` | ${Object.keys(exec.parameters).length} params`}
                    </p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
