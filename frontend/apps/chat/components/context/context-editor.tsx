"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Button,
  Badge,
  Separator,
  ScrollArea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@workstation/ui";
import { useContextEditor, useContextDashboard, useSnippets } from "@workstation/api";
import type { CompactionSummary, TokenBreakdownResponse } from "@workstation/api";
import {
  X,
  Search,
  Save,
  Loader2,
  RefreshCw,
  Archive,
  ChevronDown,
  ChevronRight,
  Pencil,
  Maximize2,
  BookOpen,
  Scissors,
} from "lucide-react";
import { ContextEditorFullscreen } from "./context-editor-fullscreen";
import { SnippetBrowser } from "./snippet-browser";
import { CompactionProgress } from "./compaction-progress";
import { MarkdownEditor } from "./markdown-editor";
import { estimateTokens, getLayerLabel, getLayerColor } from "./context-utils";
import { getClient } from "@workstation/api";
import { useToast } from "../toast-provider";

interface ContextEditorProps {
  chatId: string;
  compactions?: CompactionSummary[];
  messageCount?: number;
  chatInstructions?: string;
  systemPromptId?: string;
  activeModel?: string | null;
  onClose: () => void;
}

// ---------- Main Component ----------

export function ContextEditor({
  chatId,
  compactions = [],
  messageCount = 0,
  chatInstructions,
  systemPromptId,
  activeModel,
  onClose,
}: ContextEditorProps) {
  const {
    assembledContext,
    loading,
    saving,
    error,
    searchQuery,
    searchResults,
    fetchContext,
    updateCompaction,
    updateInstructions,
    search,
    clearSearch,
  } = useContextEditor(chatId);

  const {
    breakdown,
    loading: dashboardLoading,
    compacting,
    fetchBreakdown,
    triggerCompaction,
    compactionStatus,
  } = useContextDashboard(chatId);

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | "combined">(0);
  const [editContent, setEditContent] = useState("");
  const [editingCompactionId, setEditingCompactionId] = useState<string | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [saveSnippetOpen, setSaveSnippetOpen] = useState(false);
  const [snippetName, setSnippetName] = useState("");
  const [snippetSelection, setSnippetSelection] = useState("");
  const [snippetSaving, setSnippetSaving] = useState(false);
  const [snippetError, setSnippetError] = useState<string | null>(null);
  const [snippetRefreshKey, setSnippetRefreshKey] = useState(0);
  const { createSnippet: createSnippetViaHook } = useSnippets();
  const { toast } = useToast();
  const compactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchContext(activeModel ?? undefined);
    fetchBreakdown();
  }, [fetchContext, fetchBreakdown, activeModel]);

  useEffect(() => {
    return () => {
      if (compactTimerRef.current) clearTimeout(compactTimerRef.current);
    };
  }, []);

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

  const selectedLayer = selectedLayerIndex === "combined" ? null : assembledContext?.layers[selectedLayerIndex] ?? null;
  const isEditable = selectedLayerIndex !== "combined" && !!selectedLayer && (selectedLayer.name === "chat_instructions" || selectedLayer.name.startsWith("compaction_summary"));

  const handleSave = async () => {
    if (!selectedLayer) return;

    try {
      if (selectedLayer.name === "chat_instructions") {
        await updateInstructions(editContent);
      } else if (selectedLayer.name.startsWith("compaction_summary") && editingCompactionId) {
        await updateCompaction(editingCompactionId, editContent);
        setEditingCompactionId(null);
      }
      toast("Context saved successfully", "success");
    } catch (err) {
      toast(
        `Failed to save context: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error"
      );
    }
  };

  const handleCompact = async () => {
    try {
      await triggerCompaction();
      // CompactionProgress component handles status polling via useContextDashboard
      // Refresh context after a short delay to pick up initial state
      if (compactTimerRef.current) clearTimeout(compactTimerRef.current);
      compactTimerRef.current = setTimeout(() => {
        fetchContext(activeModel ?? undefined);
        compactTimerRef.current = null;
      }, 3000);
    } catch (err) {
      toast(
        `Compaction failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error"
      );
    }
  };

  const handleSaveAsSnippet = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return;
    const selected = editContent.slice(start, end);
    setSnippetSelection(selected);
    setSnippetName("");
    setSaveSnippetOpen(true);
  };

  const handleInsertSnippet = useCallback(
    (content: string) => {
      if (selectedLayerIndex === "combined" || !isEditable) return;
      setEditContent((prev) => prev + "\n" + content);
    },
    [selectedLayerIndex, isEditable]
  );

  const openCompactionInEditor = (compaction: CompactionSummary) => {
    if (!assembledContext) return;
    // Match by content to handle multiple compaction layers
    const idx = assembledContext.layers.findIndex(
      l => l.name.startsWith("compaction_summary") && l.content === compaction.summary
    );
    if (idx >= 0) {
      setSelectedLayerIndex(idx);
      setEditContent(compaction.summary);
      setEditingCompactionId(compaction.id);
      setActiveTab("editor");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Context Editor</h3>
          {assembledContext && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 tabular-nums">
              {assembledContext.total_tokens.toLocaleString()} tokens
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setShowFullscreen(true)}
            title="Fullscreen editor"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => { fetchContext(activeModel ?? undefined); fetchBreakdown(); }}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="border-b px-3 py-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => search(e.target.value)}
            placeholder="Search context..."
            className="h-7 pl-7 pr-16 text-xs"
          />
          {searchQuery && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {searchResults.length} match{searchResults.length !== 1 ? "es" : ""}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-4 w-4 p-0"
                onClick={clearSearch}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="mx-3 mt-2 h-8">
          <TabsTrigger value="overview" className="text-xs h-7">Overview</TabsTrigger>
          <TabsTrigger value="editor" className="text-xs h-7">Editor</TabsTrigger>
          <TabsTrigger value="compactions" className="text-xs h-7">Compactions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="flex-1 overflow-hidden m-0">
          <OverviewTab
            breakdown={breakdown}
            loading={dashboardLoading}
            compacting={compacting}
            compactionStatus={compactionStatus}
            messageCount={messageCount}
            chatInstructions={chatInstructions}
            systemPromptId={systemPromptId}
            onCompact={handleCompact}
          />
        </TabsContent>

        {/* Editor Tab */}
        <TabsContent value="editor" className="flex-1 overflow-hidden m-0">
          <div className="flex flex-col h-full">
            {/* Layer selector */}
            <div className="border-b px-3 py-1.5 flex items-center gap-1">
              <select
                value={selectedLayerIndex === "combined" ? "combined" : selectedLayerIndex}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "combined") {
                    setSelectedLayerIndex("combined");
                    setEditingCompactionId(null);
                    return;
                  }
                  const newIndex = Number(val);
                  setSelectedLayerIndex(newIndex);
                  const layer = assembledContext?.layers[newIndex];
                  if (layer && layer.name.startsWith("compaction_summary")) {
                    const match = compactions.find(c => c.summary === layer.content);
                    setEditingCompactionId(match?.id ?? null);
                  } else {
                    setEditingCompactionId(null);
                  }
                }}
                className="flex-1 h-7 text-xs rounded-md border bg-background px-2"
              >
                <option value="combined">
                  Combined View ({assembledContext?.total_tokens.toLocaleString() ?? 0} tokens)
                </option>
                {assembledContext?.layers.map((layer, idx) => (
                  <option key={idx} value={idx}>
                    {getLayerLabel(layer.name)} ({layer.tokens.toLocaleString()} tokens)
                  </option>
                )) ?? null}
              </select>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setShowSnippets(!showSnippets)}
                title="Toggle snippets"
              >
                <BookOpen className={`h-3.5 w-3.5 ${showSnippets ? "text-primary" : ""}`} />
              </Button>
            </div>

            {/* Snippet browser panel */}
            {showSnippets && (
              <div className="border-b h-40">
                <SnippetBrowser onInsert={handleInsertSnippet} refreshKey={snippetRefreshKey} />
              </div>
            )}

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              {selectedLayer || selectedLayerIndex === "combined" ? (
                <MarkdownEditor
                  content={editContent}
                  readOnly={!isEditable}
                  searchQuery={searchQuery}
                  onChange={setEditContent}
                  textareaRef={isEditable ? textareaRef : undefined}
                  gutterRef={gutterRef}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "No context loaded"
                  )}
                </div>
              )}
            </div>

            {/* Save / Save-as-snippet buttons */}
            {isEditable && (
              <div className="border-t px-3 py-2 flex gap-1">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3 mr-1.5" />
                  )}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={handleSaveAsSnippet}
                  title="Save selection as snippet"
                >
                  <Scissors className="h-3 w-3 mr-1" />
                  Snippet
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Compactions Tab */}
        <TabsContent value="compactions" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Compaction History ({compactions.length})
                </h4>
              </div>

              {compactions.length > 0 ? (
                <div className="space-y-2">
                  {compactions.map((c) => (
                    <CompactionCard
                      key={c.id}
                      compaction={c}
                      onEdit={() => openCompactionInEditor(c)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No compactions yet.</p>
              )}

              <Separator />

              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs"
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
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Fullscreen editor dialog */}
      <ContextEditorFullscreen
        chatId={chatId}
        open={showFullscreen}
        onOpenChange={setShowFullscreen}
        activeModel={activeModel}
        compactions={compactions}
      />

      {/* Save-as-Snippet dialog */}
      <Dialog
        open={saveSnippetOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSaveSnippetOpen(false);
            setSnippetError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as Snippet</DialogTitle>
            <DialogDescription>
              Save the selected text as a reusable context snippet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              value={snippetName}
              onChange={(e) => setSnippetName(e.target.value)}
              placeholder="Snippet name"
              className="h-8 text-xs"
              maxLength={255}
              autoFocus
            />
            <pre className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-mono">
              {snippetSelection.slice(0, 300)}
              {snippetSelection.length > 300 ? "..." : ""}
            </pre>
            {snippetError && (
              <p className="text-[10px] text-destructive" role="alert">{snippetError}</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="ghost" className="h-7 text-xs">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!snippetName.trim() || snippetSaving}
              onClick={async () => {
                setSnippetSaving(true);
                setSnippetError(null);
                try {
                  const result = await createSnippetViaHook({
                    name: snippetName.trim(),
                    content: snippetSelection,
                  });
                  if (result) {
                    setSaveSnippetOpen(false);
                    setSnippetRefreshKey((k) => k + 1);
                  } else {
                    setSnippetError("Failed to save snippet. Please try again.");
                  }
                } catch {
                  setSnippetError("Failed to save snippet. Please try again.");
                } finally {
                  setSnippetSaving(false);
                }
              }}
            >
              {snippetSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Sub-Components ----------

function CompactionCard({
  compaction,
  onEdit,
}: {
  compaction: CompactionSummary;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border p-2 text-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>{compaction.original_message_count} msgs compacted</span>
        </button>
        <div className="flex items-center gap-1.5">
          {compaction.status && (
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 ${
                compaction.status === "completed"
                  ? "bg-green-500/10 text-green-600"
                  : compaction.status === "failed"
                    ? "bg-red-500/10 text-red-600"
                    : "bg-yellow-500/10 text-yellow-600"
              }`}
            >
              {compaction.status}
            </Badge>
          )}
          {compaction.status === "completed" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0"
              onClick={onEdit}
              title="Edit summary"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-1 rounded bg-muted/30 p-2 text-muted-foreground/80">
          <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
            {compaction.summary}
          </pre>
        </div>
      )}

      {compaction.created_at && (
        <div className="text-[10px] text-muted-foreground/50">
          {new Date(compaction.created_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// Reuse the same TokenBar from context-dashboard
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

interface OverviewTabProps {
  breakdown: TokenBreakdownResponse | null;
  loading: boolean;
  compacting: boolean;
  compactionStatus?: import("@workstation/api").CompactionStatusResponse | null;
  messageCount?: number;
  chatInstructions?: string;
  systemPromptId?: string;
  onCompact: () => void;
}

function OverviewTab({
  breakdown,
  loading,
  compacting,
  compactionStatus,
  messageCount = 0,
  chatInstructions,
  systemPromptId,
  onCompact,
}: OverviewTabProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-3">
        {/* Token Budget */}
        {breakdown && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Token Budget
            </h4>

            {/* Fill bar */}
            <div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                {breakdown.context_window > 0 && (
                <div className="flex h-full">
                  {breakdown.system_prompt_tokens > 0 && (
                    <div
                      className="bg-blue-500 h-full"
                      style={{ width: `${(breakdown.system_prompt_tokens / breakdown.context_window) * 100}%` }}
                    />
                  )}
                  {breakdown.project_context_tokens > 0 && (
                    <div
                      className="bg-purple-500 h-full"
                      style={{ width: `${(breakdown.project_context_tokens / breakdown.context_window) * 100}%` }}
                    />
                  )}
                  {breakdown.chat_instructions_tokens > 0 && (
                    <div
                      className="bg-cyan-500 h-full"
                      style={{ width: `${(breakdown.chat_instructions_tokens / breakdown.context_window) * 100}%` }}
                    />
                  )}
                  {breakdown.kb_results_tokens > 0 && (
                    <div
                      className="bg-amber-500 h-full"
                      style={{ width: `${(breakdown.kb_results_tokens / breakdown.context_window) * 100}%` }}
                    />
                  )}
                  {breakdown.compaction_summary_tokens > 0 && (
                    <div
                      className="bg-orange-500 h-full"
                      style={{ width: `${(breakdown.compaction_summary_tokens / breakdown.context_window) * 100}%` }}
                    />
                  )}
                  {breakdown.conversation_tokens > 0 && (
                    <div
                      className="bg-green-500 h-full"
                      style={{ width: `${(breakdown.conversation_tokens / breakdown.context_window) * 100}%` }}
                    />
                  )}
                </div>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{breakdown.total.toLocaleString()} / {breakdown.context_window.toLocaleString()}</span>
                <span className={breakdown.fill_ratio > 0.9 ? "text-red-500 font-medium" : ""}>
                  {Math.round(breakdown.fill_ratio * 100)}% used
                </span>
              </div>
            </div>

            {/* Per-layer breakdown */}
            <div className="space-y-1.5">
              <TokenBar label="System Prompt" tokens={breakdown.system_prompt_tokens} total={breakdown.context_window} color="bg-blue-500" />
              <TokenBar label="Project Context" tokens={breakdown.project_context_tokens} total={breakdown.context_window} color="bg-purple-500" />
              <TokenBar label="Chat Instructions" tokens={breakdown.chat_instructions_tokens} total={breakdown.context_window} color="bg-cyan-500" />
              <TokenBar label="Knowledge Base" tokens={breakdown.kb_results_tokens} total={breakdown.context_window} color="bg-amber-500" />
              <TokenBar label="Compaction Summaries" tokens={breakdown.compaction_summary_tokens} total={breakdown.context_window} color="bg-orange-500" />
              <TokenBar label="Conversation" tokens={breakdown.conversation_tokens} total={breakdown.context_window} color="bg-green-500" />
            </div>
          </div>
        )}

        <Separator />

        {/* Active Context */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Active Context
          </h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5">
              <span className="text-muted-foreground">System Prompt</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {systemPromptId ? "Custom" : "Default"}
              </Badge>
            </div>
            {chatInstructions && (
              <div className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5">
                <span className="text-muted-foreground">Chat Instructions</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {chatInstructions.length} chars
                </Badge>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Message Stats */}
        {breakdown && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Message Stats
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-muted/30 p-2">
                <div className="text-sm font-medium">{breakdown.message_count}</div>
                <div className="text-[10px] text-muted-foreground">Total</div>
              </div>
              <div className="rounded-md bg-muted/30 p-2">
                <div className="text-sm font-medium">{breakdown.pinned_count}</div>
                <div className="text-[10px] text-muted-foreground">Pinned</div>
              </div>
              <div className="rounded-md bg-muted/30 p-2">
                <div className="text-sm font-medium">{breakdown.excluded_count}</div>
                <div className="text-[10px] text-muted-foreground">Excluded</div>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Compaction progress + Compact Now */}
        <CompactionProgress compacting={compacting} compactionStatus={compactionStatus ?? null} />

        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs"
          onClick={onCompact}
          disabled={compacting}
        >
          {compacting ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : (
            <Archive className="mr-1.5 h-3 w-3" />
          )}
          Compact Now
        </Button>

        {loading && (
          <div className="flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
