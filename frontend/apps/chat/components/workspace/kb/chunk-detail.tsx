"use client";

import { useCallback, useState } from "react";
import { Button, Badge, ScrollArea, Separator } from "@workstation/ui";
import {
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Hash,
  Database,
} from "lucide-react";
import type { KBChunk } from "@workstation/api/types";

interface ChunkDetailProps {
  chunk: KBChunk;
  currentIndex: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function ChunkDetail({
  chunk,
  currentIndex,
  totalCount,
  onPrevious,
  onNext,
}: ChunkDetailProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(chunk.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = chunk.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [chunk.content]);

  return (
    <div className="flex h-full flex-col">
      {/* Header with navigation */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">
            Chunk {chunk.chunk_index + 1}
          </span>
          <Badge
            variant={chunk.has_embedding ? "secondary" : "outline"}
            className="h-4 text-[9px]"
          >
            {chunk.has_embedding ? "Embedded" : "No Embedding"}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onPrevious}
            disabled={currentIndex <= 0}
            title="Previous chunk"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {currentIndex + 1} / {totalCount}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onNext}
            disabled={currentIndex >= totalCount - 1}
            title="Next chunk"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Copy button */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </Button>
          </div>

          {/* Chunk content with syntax highlighting via monospace */}
          <div className="rounded-md border bg-muted/30 p-3">
            <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">
              {chunk.content}
            </pre>
          </div>

          <Separator />

          {/* Metadata section */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Database className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] font-medium">Metadata</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="text-muted-foreground">Chunk ID</div>
              <div className="font-mono text-[10px] truncate" title={chunk.id}>
                {chunk.id}
              </div>
              <div className="text-muted-foreground">Source ID</div>
              <div
                className="font-mono text-[10px] truncate"
                title={chunk.source_id}
              >
                {chunk.source_id}
              </div>
              <div className="text-muted-foreground">Index</div>
              <div>{chunk.chunk_index}</div>
              <div className="text-muted-foreground">Embedding</div>
              <div>{chunk.has_embedding ? "Yes" : "No"}</div>
              <div className="text-muted-foreground">Content Length</div>
              <div>{chunk.content.length} chars</div>
              {chunk.similarity != null && (
                <>
                  <div className="text-muted-foreground">Similarity</div>
                  <div>{chunk.similarity.toFixed(4)}</div>
                </>
              )}
            </div>

            {/* Extra metadata from chunk_metadata */}
            {chunk.metadata &&
              Object.keys(chunk.metadata).length > 0 && (
                <>
                  <Separator />
                  <div className="rounded-md border bg-muted/30 p-2">
                    <pre className="text-[10px] font-mono whitespace-pre-wrap break-words">
                      {JSON.stringify(chunk.metadata, null, 2)}
                    </pre>
                  </div>
                </>
              )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
