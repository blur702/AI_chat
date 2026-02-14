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
} from "@workstation/ui";
import { useContextEditor, useContextDashboard } from "@workstation/api";
import type { CompactionSummary, TokenBreakdownResponse } from "@workstation/api";
import {
  X,
  Search,
  Save,
  Loader2,
  Trash2,
  RefreshCw,
  Archive,
  ChevronDown,
  ChevronRight,
  Pencil,
  Eye,
  WrapText,
  Hash,
} from "lucide-react";

interface ContextEditorProps {
  chatId: string;
  compactions?: CompactionSummary[];
  messageCount?: number;
  chatInstructions?: string;
  systemPromptId?: string;
  activeModel?: string | null;
  onClose: () => void;
}

// Estimate tokens: ~4 chars per token
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Resolve display label for a layer name (handles indexed names like compaction_summary_0)
function getLayerLabel(name: string): string {
  const labels: Record<string, string> = {
    system_prompt: "System Prompt",
    project_context: "Project Context",
    chat_instructions: "Chat Instructions",
    conversation: "Conversation",
  };
  if (labels[name]) return labels[name];
  if (name.startsWith("compaction_summary")) return "Compaction Summary";
  return name;
}

function getLayerColor(name: string): string {
  const colors: Record<string, string> = {
    system_prompt: "bg-blue-500/10 text-blue-600",
    project_context: "bg-purple-500/10 text-purple-600",
    chat_instructions: "bg-cyan-500/10 text-cyan-600",
    conversation: "bg-green-500/10 text-green-600",
  };
  if (colors[name]) return colors[name];
  if (name.startsWith("compaction_summary")) return "bg-orange-500/10 text-orange-600";
  return "";
}

function LayerBadge({ name }: { name: string }) {
  return (
    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${getLayerColor(name)}`}>
      {getLayerLabel(name)}
    </Badge>
  );
}

// ---------- Markdown Editor ----------

interface MarkdownEditorProps {
  content: string;
  readOnly: boolean;
  searchQuery: string;
  onChange: (content: string) => void;
}

function MarkdownEditor({ content, readOnly, searchQuery, onChange }: MarkdownEditorProps) {
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [wordWrap, setWordWrap] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lines = useMemo(() => content.split("\n"), [content]);
  const lowerQuery = searchQuery.toLowerCase();

  const toggleLine = (lineIdx: number) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineIdx)) {
        next.delete(lineIdx);
      } else {
        next.add(lineIdx);
      }
      return next;
    });
  };

  const deleteSelectedLines = () => {
    const remaining = lines.filter((_, idx) => !selectedLines.has(idx));
    onChange(remaining.join("\n"));
    setSelectedLines(new Set());
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const tokenCount = estimateTokens(content);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-2 py-1.5 bg-muted/30">
        <div className="flex items-center gap-1.5">
          {!readOnly && selectedLines.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[10px] px-2"
              onClick={deleteSelectedLines}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete {selectedLines.size} line{selectedLines.size > 1 ? "s" : ""}
            </Button>
          )}
          {readOnly && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Eye className="h-3 w-3" />
              Read-only
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setWordWrap(!wordWrap)}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          >
            <WrapText className={`h-3 w-3 ${wordWrap ? "text-foreground" : "text-muted-foreground"}`} />
          </Button>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 tabular-nums">
            <Hash className="h-2.5 w-2.5 mr-0.5" />
            {tokenCount.toLocaleString()} tokens
          </Badge>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Line numbers + checkboxes gutter */}
        <div className="shrink-0 border-r bg-muted/20 overflow-y-auto select-none" style={{ minWidth: readOnly ? 40 : 60 }}>
          {lines.map((line, idx) => {
            const isHighlighted = lowerQuery && line.toLowerCase().includes(lowerQuery);
            return (
              <div
                key={idx}
                className={`flex items-center gap-0.5 px-1 text-[10px] text-muted-foreground leading-[20px] ${
                  isHighlighted ? "bg-yellow-500/20" : ""
                }`}
              >
                {!readOnly && (
                  <input
                    type="checkbox"
                    className="h-2.5 w-2.5 rounded-sm"
                    checked={selectedLines.has(idx)}
                    onChange={() => toggleLine(idx)}
                  />
                )}
                <span className="tabular-nums text-right" style={{ minWidth: 24 }}>
                  {idx + 1}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content area */}
        {readOnly ? (
          <ScrollArea className="flex-1">
            <pre
              className={`p-2 text-xs font-mono leading-[20px] ${wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
            >
              {lines.map((line, idx) => {
                const isHighlighted = lowerQuery && line.toLowerCase().includes(lowerQuery);
                return (
                  <div key={idx} className={isHighlighted ? "bg-yellow-500/20" : ""}>
                    {renderMarkdownLine(line)}
                  </div>
                );
              })}
            </pre>
          </ScrollArea>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextChange}
            className={`flex-1 p-2 text-xs font-mono leading-[20px] bg-transparent resize-none border-0 outline-none ${
              wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre overflow-x-auto"
            }`}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}

// Simple markdown line rendering for read-only view
function renderMarkdownLine(line: string) {
  if (line.startsWith("## ")) {
    return <span className="font-bold text-foreground">{line}</span>;
  }
  if (line.startsWith("# ")) {
    return <span className="font-bold text-foreground text-sm">{line}</span>;
  }
  if (line.startsWith("- ") || line.startsWith("* ")) {
    return <span className="text-muted-foreground">{line}</span>;
  }
  // Bold spans
  const boldRegex = /\*\*(.*?)\*\*/;
  if (boldRegex.test(line)) {
    const parts = line.split(/(\*\*.*?\*\*)/);
    return (
      <>
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <span key={i} className="font-bold">{part.slice(2, -2)}</span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  }
  return line;
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
  } = useContextDashboard(chatId);

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(0);
  const [editContent, setEditContent] = useState("");
  const [editingCompactionId, setEditingCompactionId] = useState<string | null>(null);
  const compactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (assembledContext && assembledContext.layers[selectedLayerIndex]) {
      setEditContent(assembledContext.layers[selectedLayerIndex].content);
    }
  }, [assembledContext, selectedLayerIndex]);

  const selectedLayer = assembledContext?.layers[selectedLayerIndex];
  const isEditable = selectedLayer?.name === "chat_instructions" || selectedLayer?.name.startsWith("compaction_summary");

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
    compactTimerRef.current = setTimeout(() => {
      fetchBreakdown();
      fetchContext(activeModel ?? undefined);
      compactTimerRef.current = null;
    }, 2000);
  };

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
            <div className="border-b px-3 py-1.5">
              <select
                value={selectedLayerIndex}
                onChange={(e) => {
                  const newIndex = Number(e.target.value);
                  setSelectedLayerIndex(newIndex);
                  // Resolve compaction ID if the selected layer is a compaction summary
                  const layer = assembledContext?.layers[newIndex];
                  if (layer && layer.name.startsWith("compaction_summary")) {
                    const match = compactions.find(c => c.summary === layer.content);
                    setEditingCompactionId(match?.id ?? null);
                  } else {
                    setEditingCompactionId(null);
                  }
                }}
                className="w-full h-7 text-xs rounded-md border bg-background px-2"
              >
                {assembledContext?.layers.map((layer, idx) => (
                  <option key={idx} value={idx}>
                    {getLayerLabel(layer.name)} ({layer.tokens.toLocaleString()} tokens)
                  </option>
                )) ?? <option>Loading...</option>}
              </select>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              {selectedLayer ? (
                <MarkdownEditor
                  content={editContent}
                  readOnly={!isEditable}
                  searchQuery={searchQuery}
                  onChange={setEditContent}
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

            {/* Save button */}
            {isEditable && (
              <div className="border-t px-3 py-2">
                <Button
                  size="sm"
                  className="w-full h-7 text-xs"
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
  messageCount?: number;
  chatInstructions?: string;
  systemPromptId?: string;
  onCompact: () => void;
}

function OverviewTab({
  breakdown,
  loading,
  compacting,
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

        {/* Compact Now */}
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
