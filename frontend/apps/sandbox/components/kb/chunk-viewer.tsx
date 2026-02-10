"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Badge,
  ScrollArea,
  Separator,
} from "@workstation/ui";
import {
  X,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useKnowledgeBase } from "@workstation/api/hooks";
import type { KBChunk } from "@workstation/api/types";
import { ChunkDetail } from "./chunk-detail";

const PAGE_SIZE = 50;

interface ChunkViewerProps {
  sourceId: string;
  sourceName: string;
  totalChunkCount?: number;
  onClose: () => void;
}

export function ChunkViewer({
  sourceId,
  sourceName,
  totalChunkCount,
  onClose,
}: ChunkViewerProps) {
  const { chunks, chunksLoading, getChunks } = useKnowledgeBase();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedChunk, setSelectedChunk] = useState<KBChunk | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Use the source's chunk_count if available, otherwise estimate from loaded data
  const knownTotal = totalChunkCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(knownTotal / PAGE_SIZE));

  // Fetch chunks on mount and page change
  useEffect(() => {
    const skip = (currentPage - 1) * PAGE_SIZE;
    getChunks(sourceId, skip, PAGE_SIZE);
  }, [sourceId, currentPage, getChunks]);

  // Auto-select chunk when chunks load, honoring selectedIndex for page navigation
  useEffect(() => {
    if (chunks.length === 0) return;
    if (selectedChunk) return;
    const idx = selectedIndex >= 0 && selectedIndex < chunks.length
      ? selectedIndex
      : 0;
    setSelectedChunk(chunks[idx]);
    setSelectedIndex(idx);
  }, [chunks, selectedChunk, selectedIndex]);

  const handleSelectChunk = useCallback(
    (chunk: KBChunk, index: number) => {
      setSelectedChunk(chunk);
      setSelectedIndex(index);
    },
    []
  );

  const handlePrevious = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedChunk(chunks[selectedIndex - 1]);
      setSelectedIndex(selectedIndex - 1);
    } else if (currentPage > 1) {
      // Go to previous page, will select last item after load
      setCurrentPage((p) => p - 1);
      setSelectedChunk(null);
      setSelectedIndex(PAGE_SIZE - 1);
    }
  }, [selectedIndex, chunks, currentPage]);

  const handleNext = useCallback(() => {
    if (selectedIndex < chunks.length - 1) {
      setSelectedChunk(chunks[selectedIndex + 1]);
      setSelectedIndex(selectedIndex + 1);
    } else if (currentPage < totalPages) {
      // Go to next page, will select first item after load
      setCurrentPage((p) => p + 1);
      setSelectedChunk(null);
      setSelectedIndex(0);
    }
  }, [selectedIndex, chunks, currentPage, totalPages]);

  const globalIndex = (currentPage - 1) * PAGE_SIZE + selectedIndex;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold uppercase truncate">
            Chunks
          </span>
          <Badge variant="secondary" className="h-4 text-[9px] shrink-0">
            {knownTotal}
          </Badge>
          <Separator orientation="vertical" className="h-3 mx-1" />
          <span
            className="text-[10px] text-muted-foreground truncate"
            title={sourceName}
          >
            {sourceName}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content area: list + detail split */}
      <div className="flex flex-1 min-h-0">
        {/* Chunk list (left panel) */}
        <div className="w-1/3 min-w-[180px] max-w-[280px] border-r flex flex-col">
          {chunksLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : chunks.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-1.5 px-3">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground text-center">
                No chunks found for this source.
              </p>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1">
                <div className="space-y-0.5 p-1.5">
                  {chunks.map((chunk, i) => (
                    <button
                      key={chunk.id}
                      className={`w-full text-left rounded-md px-2.5 py-2 transition-colors ${
                        selectedChunk?.id === chunk.id
                          ? "bg-accent"
                          : "hover:bg-accent/50"
                      }`}
                      onClick={() => handleSelectChunk(chunk, i)}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-medium">
                          #{chunk.chunk_index + 1}
                        </span>
                        <Badge
                          variant={
                            chunk.has_embedding ? "secondary" : "outline"
                          }
                          className="h-3.5 text-[8px] shrink-0"
                        >
                          {chunk.has_embedding ? "E" : "-"}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                        {chunk.content.slice(0, 120)}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-2 py-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() =>
                      setCurrentPage((p) => {
                        setSelectedChunk(null);
                        return Math.max(1, p - 1);
                      })
                    }
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() =>
                      setCurrentPage((p) => {
                        setSelectedChunk(null);
                        return Math.min(totalPages, p + 1);
                      })
                    }
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail panel (right) */}
        <div className="flex-1 min-w-0">
          {selectedChunk ? (
            <ChunkDetail
              chunk={selectedChunk}
              currentIndex={globalIndex}
              totalCount={knownTotal}
              onPrevious={handlePrevious}
              onNext={handleNext}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-muted-foreground">
                {chunksLoading
                  ? "Loading chunks..."
                  : "Select a chunk to view details"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
