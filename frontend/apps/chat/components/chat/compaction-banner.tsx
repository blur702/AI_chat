"use client";

import { useState } from "react";
import { cn, Badge, Button } from "@workstation/ui";
import { ChevronDown, ChevronRight, Archive } from "lucide-react";
import type { CompactionSummary } from "@workstation/api";

interface CompactionBannerProps {
  compaction: CompactionSummary;
}

export function CompactionBanner({ compaction }: CompactionBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const statusColor =
    compaction.status === "completed"
      ? "bg-green-500/10 text-green-700 dark:text-green-400"
      : compaction.status === "failed"
        ? "bg-red-500/10 text-red-700 dark:text-red-400"
        : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";

  return (
    <div className="mx-4 my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`Compaction summary: ${compaction.original_message_count} messages summarized`}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <Archive className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">
          Conversation summarized ({compaction.original_message_count} messages)
        </span>
        {compaction.status && (
          <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", statusColor)}>
            {compaction.status}
          </Badge>
        )}
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 rounded-md border border-dashed border-muted-foreground/20 bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {compaction.summary}
          </p>
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground/70">
            <span>{compaction.original_message_count} original messages</span>
            <span>{compaction.compacted_message_count} after compaction</span>
            {compaction.created_at && (
              <span>{new Date(compaction.created_at).toLocaleString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
