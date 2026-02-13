"use client";

import { useEffect, useRef } from "react";
import { Button, Badge, Separator, ScrollArea } from "@workstation/ui";
import { useContextDashboard } from "@workstation/api";
import type { CompactionSummary } from "@workstation/api";
import {
  RefreshCw,
  Loader2,
  Archive,
  Pin,
  EyeOff,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

interface ContextDashboardProps {
  chatId: string;
  compactions?: CompactionSummary[];
  messageCount?: number;
  chatInstructions?: string;
  systemPromptId?: string;
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

export function ContextDashboard({
  chatId,
  compactions = [],
  messageCount = 0,
  chatInstructions,
  systemPromptId,
}: ContextDashboardProps) {
  const { breakdown, loading, compacting, error, fetchBreakdown, triggerCompaction } =
    useContextDashboard(chatId);

  const [compactionsExpanded, setCompactionsExpanded] = useState(false);
  const compactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (compactTimerRef.current) {
        clearTimeout(compactTimerRef.current);
      }
    };
  }, []);

  const handleCompact = async () => {
    await triggerCompaction();
    // Re-fetch breakdown after compaction completes server-side
    compactTimerRef.current = setTimeout(() => {
      fetchBreakdown();
      compactTimerRef.current = null;
    }, 2000);
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Context Dashboard</h3>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => fetchBreakdown()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Token Budget */}
        {breakdown && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Token Budget
            </h4>

            {/* Fill bar */}
            <div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                {/* Stacked segments */}
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
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{breakdown.total.toLocaleString()} / {breakdown.context_window.toLocaleString()}</span>
                <span className={breakdown.fill_ratio > 0.8 ? "text-red-500 font-medium" : ""}>
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

        {/* Active Context Layers */}
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

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-muted/30 p-2 text-center">
                <MessageSquare className="mx-auto h-3.5 w-3.5 text-muted-foreground mb-1" />
                <div className="text-sm font-medium">{breakdown.message_count}</div>
                <div className="text-[10px] text-muted-foreground">Total</div>
              </div>
              <div className="rounded-md bg-muted/30 p-2 text-center">
                <Pin className="mx-auto h-3.5 w-3.5 text-amber-500 mb-1" />
                <div className="text-sm font-medium">{breakdown.pinned_count}</div>
                <div className="text-[10px] text-muted-foreground">Pinned</div>
              </div>
              <div className="rounded-md bg-muted/30 p-2 text-center">
                <EyeOff className="mx-auto h-3.5 w-3.5 text-muted-foreground mb-1" />
                <div className="text-sm font-medium">{breakdown.excluded_count}</div>
                <div className="text-[10px] text-muted-foreground">Excluded</div>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Compaction History */}
        <div className="space-y-2">
          <button
            onClick={() => setCompactionsExpanded(!compactionsExpanded)}
            className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            {compactionsExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Compaction History ({compactions.length})
          </button>

          {compactionsExpanded && compactions.length > 0 && (
            <div className="space-y-1.5">
              {compactions.map((c) => (
                <div key={c.id} className="rounded-md border border-dashed p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground">
                      {c.original_message_count} msgs compacted
                    </span>
                    {c.status && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${
                          c.status === "completed"
                            ? "bg-green-500/10 text-green-600"
                            : c.status === "failed"
                              ? "bg-red-500/10 text-red-600"
                              : "bg-yellow-500/10 text-yellow-600"
                        }`}
                      >
                        {c.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground/70 line-clamp-2">{c.summary}</p>
                </div>
              ))}
            </div>
          )}

          {compactionsExpanded && compactions.length === 0 && (
            <p className="text-xs text-muted-foreground">No compactions yet.</p>
          )}

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
      </div>
    </ScrollArea>
  );
}
