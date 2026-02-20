"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Badge,
  Button,
  ScrollArea,
  Separator,
} from "@workstation/ui";
import { useContextEditor, useContextDashboard } from "@workstation/api";
import type { CompactionSummary, TokenBreakdownResponse } from "@workstation/api";
import { MonacoWrapper } from "../workspace/editor/monaco-editor";
import { SnippetBrowser } from "./snippet-browser";
import { CompactionProgress } from "./compaction-progress";
import { estimateTokens, getLayerLabel, getLayerColor } from "./context-utils";
import {
  X,
  Save,
  Loader2,
  RefreshCw,
  Archive,
  Hash,
  Layers,
  BookOpen,
} from "lucide-react";

interface ContextEditorFullscreenProps {
  chatId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeModel?: string | null;
  compactions?: CompactionSummary[];
}

function TokenBar({
  label,
  tokens,
  total,
  color,
}: {
  label: string;
  tokens: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (tokens / total) * 100 : 0;
  if (tokens === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`h-2.5 w-2.5 rounded-sm shrink-0 ${color}`} />
      <span className="flex-1 truncate text-muted-foreground">{label}</span>
      <span className="tabular-nums text-muted-foreground">{tokens.toLocaleString()}</span>
      <span className="text-muted-foreground/60 w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  );
}

export function ContextEditorFullscreen({
  chatId,
  open,
  onOpenChange,
  activeModel,
  compactions = [],
}: ContextEditorFullscreenProps) {
  const {
    assembledContext,
    loading,
    saving,
    error,
    fetchContext,
    updateCompaction,
    updateInstructions,
  } = useContextEditor(chatId);

  const {
    breakdown,
    loading: dashboardLoading,
    compacting,
    error: dashboardError,
    fetchBreakdown,
    triggerCompaction,
    compactionStatus,
  } = useContextDashboard(chatId);

  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | "combined">(0);
  const [editContent, setEditContent] = useState("");
  const [editingCompactionId, setEditingCompactionId] = useState<string | null>(null);
  const [showSnippets, setShowSnippets] = useState(false);

  useEffect(() => {
    if (open) {
      fetchContext(activeModel ?? undefined);
      fetchBreakdown();
    }
  }, [open, fetchContext, fetchBreakdown, activeModel]);

  // Sync edit content with selected layer
  useEffect(() => {
    if (!assembledContext) return;
    if (selectedLayerIndex === "combined") {
      const combined = assembledContext.layers
        .map((l) => `--- ${getLayerLabel(l.name)} (${l.tokens.toLocaleString()} tokens) ---\n${l.content}`)
        .join("\n\n");
      setEditContent(combined);
    } else if (assembledContext.layers[selectedLayerIndex]) {
      setEditContent(assembledContext.layers[selectedLayerIndex].content);
    }
  }, [assembledContext, selectedLayerIndex]);

  const selectedLayer =
    selectedLayerIndex === "combined"
      ? null
      : assembledContext?.layers[selectedLayerIndex] ?? null;

  const isEditable =
    selectedLayerIndex !== "combined" &&
    !!selectedLayer &&
    (selectedLayer.name === "chat_instructions" || selectedLayer.name.startsWith("compaction_summary"));

  const handleSave = async () => {
    if (!selectedLayer) return;
    if (selectedLayer.name === "chat_instructions") {
      await updateInstructions(editContent);
    } else if (selectedLayer.name.startsWith("compaction_summary") && editingCompactionId) {
      await updateCompaction(editingCompactionId, editContent);
      setEditingCompactionId(null);
    }
  };

  const handleCompact = async () => {
    await triggerCompaction();
  };

  const handleInsertSnippet = useCallback(
    (content: string) => {
      if (selectedLayerIndex === "combined" || !isEditable) return;
      setEditContent((prev) => prev + "\n" + content);
    },
    [selectedLayerIndex, isEditable]
  );

  const editorLanguage = "markdown";
  const isReadOnly = selectedLayerIndex === "combined" || !isEditable;
  const tokenCount = estimateTokens(editContent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0 gap-0">
        <DialogTitle className="sr-only">Context Editor</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Context Editor</h2>
            {assembledContext && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 tabular-nums">
                {assembledContext.total_tokens.toLocaleString()} total tokens
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1"
              onClick={() => setShowSnippets(!showSnippets)}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="text-xs">Snippets</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => {
                fetchContext(activeModel ?? undefined);
                fetchBreakdown();
              }}
              disabled={loading}
              aria-label="Refresh context"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {(error || dashboardError) && (
          <div className="mx-4 mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error || dashboardError}
          </div>
        )}

        {/* 3-column layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar: layer list + snippets */}
          <div className="w-56 border-r flex flex-col shrink-0">
            {/* Layer list */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b">
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Layers
                </h4>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-1.5 space-y-0.5">
                  {/* Combined view option */}
                  <button
                    onClick={() => setSelectedLayerIndex("combined")}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors ${
                      selectedLayerIndex === "combined"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Combined View</span>
                      {assembledContext && (
                        <span className="text-[10px] tabular-nums">
                          {assembledContext.total_tokens.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">All layers (read-only)</span>
                  </button>

                  <Separator className="my-1" />

                  {assembledContext?.layers.map((layer, idx) => (
                    <button
                      key={layer.name + idx}
                      onClick={() => {
                        setSelectedLayerIndex(idx);
                        if (layer.name.startsWith("compaction_summary")) {
                          // Match compaction by content to find the correct ID
                          const match = compactions.find(c => c.summary === layer.content);
                          setEditingCompactionId(match?.id ?? null);
                        } else {
                          setEditingCompactionId(null);
                        }
                      }}
                      className={`w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors ${
                        selectedLayerIndex === idx
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${getLayerColor(layer.name)}`}
                        >
                          {getLayerLabel(layer.name)}
                        </Badge>
                        <span className="text-[10px] tabular-nums">
                          {layer.tokens.toLocaleString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Snippet browser (collapsible) */}
            {showSnippets && (
              <div className="border-t h-60 flex flex-col">
                <div className="px-3 py-2 border-b">
                  <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Snippets
                  </h4>
                </div>
                <div className="flex-1 overflow-hidden">
                  <SnippetBrowser onInsert={handleInsertSnippet} />
                </div>
              </div>
            )}
          </div>

          {/* Center: Monaco editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Editor toolbar */}
            <div className="flex items-center justify-between border-b px-3 py-1.5 bg-muted/30">
              <div className="flex items-center gap-2">
                {selectedLayer && (
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 ${getLayerColor(selectedLayer.name)}`}
                  >
                    {getLayerLabel(selectedLayer.name)}
                  </Badge>
                )}
                {selectedLayerIndex === "combined" && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Combined View (read-only)
                  </Badge>
                )}
                {isReadOnly && selectedLayerIndex !== "combined" && (
                  <span className="text-[10px] text-muted-foreground">Read-only</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 tabular-nums">
                  <Hash className="h-2.5 w-2.5 mr-0.5" />
                  {tokenCount.toLocaleString()} tokens
                </Badge>
                {isEditable && (
                  <Button
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3 mr-1" />
                    )}
                    Save
                  </Button>
                )}
              </div>
            </div>

            {/* Monaco editor */}
            <div className="flex-1 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <MonacoWrapper
                  value={editContent}
                  language={editorLanguage}
                  onChange={(val) => {
                    if (val !== undefined && !isReadOnly) {
                      setEditContent(val);
                    }
                  }}
                  readOnly={isReadOnly}
                  minimap
                  wordWrap="on"
                />
              )}
            </div>
          </div>

          {/* Right sidebar: token breakdown */}
          <div className="w-56 border-l flex flex-col shrink-0">
            <div className="px-3 py-2 border-b">
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Token Breakdown
              </h4>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                {breakdown ? (
                  <>
                    {/* Fill bar */}
                    <div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        {breakdown.context_window > 0 && (
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${Math.min(breakdown.fill_ratio * 100, 100)}%`,
                            }}
                          />
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{breakdown.total.toLocaleString()}</span>
                        <span
                          className={
                            breakdown.fill_ratio > 0.9 ? "text-red-500 font-medium" : ""
                          }
                        >
                          {Math.round(breakdown.fill_ratio * 100)}%
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <TokenBar
                        label="System"
                        tokens={breakdown.system_prompt_tokens}
                        total={breakdown.context_window}
                        color="bg-blue-500"
                      />
                      <TokenBar
                        label="Project"
                        tokens={breakdown.project_context_tokens}
                        total={breakdown.context_window}
                        color="bg-purple-500"
                      />
                      <TokenBar
                        label="Instructions"
                        tokens={breakdown.chat_instructions_tokens}
                        total={breakdown.context_window}
                        color="bg-cyan-500"
                      />
                      <TokenBar
                        label="KB"
                        tokens={breakdown.kb_results_tokens}
                        total={breakdown.context_window}
                        color="bg-amber-500"
                      />
                      <TokenBar
                        label="Compaction"
                        tokens={breakdown.compaction_summary_tokens}
                        total={breakdown.context_window}
                        color="bg-orange-500"
                      />
                      <TokenBar
                        label="Conversation"
                        tokens={breakdown.conversation_tokens}
                        total={breakdown.context_window}
                        color="bg-green-500"
                      />
                    </div>

                    <Separator />

                    {/* Message stats */}
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Messages</span>
                        <span className="tabular-nums">{breakdown.message_count}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Pinned</span>
                        <span className="tabular-nums">{breakdown.pinned_count}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Excluded</span>
                        <span className="tabular-nums">{breakdown.excluded_count}</span>
                      </div>
                    </div>
                  </>
                ) : dashboardLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No data available.</p>
                )}

                {(breakdown || compacting) && <Separator />}

                {/* Compaction */}
                <div className="space-y-2">
                  <CompactionProgress
                    compacting={compacting}
                    compactionStatus={compactionStatus ?? null}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs"
                    onClick={handleCompact}
                    disabled={compacting}
                  >
                    {compacting ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <Archive className="mr-1.5 h-3 w-3" />
                    )}
                    Compact Now
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
