"use client";

import { useState, useCallback } from "react";
import {
  Button,
  Badge,
  ScrollArea,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@workstation/ui";
import {
  FileText,
  Eye,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { KBSource } from "@workstation/api/types";
import { ChunkViewer } from "./chunk-viewer";

interface SourcesListProps {
  sources: KBSource[];
  loading: boolean;
  error?: string | null;
}

const statusConfig: Record<
  string,
  { icon: React.ElementType; variant: "secondary" | "outline" | "destructive" | "default"; label: string }
> = {
  pending: { icon: Clock, variant: "outline", label: "Pending" },
  processing: { icon: Loader2, variant: "secondary", label: "Processing" },
  completed: { icon: CheckCircle2, variant: "default", label: "Completed" },
  failed: { icon: XCircle, variant: "destructive", label: "Failed" },
};

function getSourceFileName(source: KBSource): string {
  const path = source.source_path;
  const parts = path.split(/[/\\]/);
  const filename = parts[parts.length - 1] || path;
  // Remove the UUID prefix if present (format: uuid_filename)
  const underscoreIdx = filename.indexOf("_");
  if (underscoreIdx > 30) {
    return filename.slice(underscoreIdx + 1);
  }
  return filename;
}

export function SourcesList({ sources, loading, error }: SourcesListProps) {
  const [viewingSource, setViewingSource] = useState<KBSource | null>(null);

  const handleViewChunks = useCallback((source: KBSource) => {
    setViewingSource(source);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewingSource(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
        <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        <span className="text-xs text-destructive">{error}</span>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <FileText className="h-6 w-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          No knowledge base sources yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-1.5">
          {sources.map((source) => {
            const config = statusConfig[source.status] ?? statusConfig.pending;
            const StatusIcon = config.icon;
            const isCompleted = source.status === "completed";

            return (
              <div
                key={source.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2 group"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">
                      {getSourceFileName(source)}
                    </span>
                    <Badge
                      variant={config.variant}
                      className="h-4 text-[9px] shrink-0 gap-0.5"
                    >
                      <StatusIcon
                        className={`h-2.5 w-2.5 ${
                          source.status === "processing" ? "animate-spin" : ""
                        }`}
                      />
                      {config.label}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {source.source_type} &middot;{" "}
                    {source.created_at
                      ? new Date(source.created_at).toLocaleDateString()
                      : ""}
                  </p>
                </div>

                {isCompleted && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleViewChunks(source)}
                  >
                    <Eye className="h-3 w-3" />
                    View Chunks
                    {source.chunk_count > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-4 text-[9px] ml-0.5"
                      >
                        {source.chunk_count}
                      </Badge>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Chunk Viewer Dialog */}
      <Dialog
        open={viewingSource !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseViewer();
        }}
      >
        <DialogContent className="max-w-4xl h-[70vh] p-0 gap-0 flex flex-col">
          <DialogTitle className="sr-only">
            Chunks for {viewingSource ? getSourceFileName(viewingSource) : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">
            View and navigate knowledge base chunks for the selected source
            document.
          </DialogDescription>
          {viewingSource && (
            <ChunkViewer
              sourceId={viewingSource.id}
              sourceName={getSourceFileName(viewingSource)}
              totalChunkCount={viewingSource.chunk_count}
              onClose={handleCloseViewer}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
