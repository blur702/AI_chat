"use client";

import { Badge, Button, Skeleton, cn } from "@workstation/ui";
import {
  AlertCircle,
  Clock,
  Download,
  Eye,
  ImageIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@workstation/api/types";

interface ImageCardProps {
  generation: ImageGenerationResponse;
  onView: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  bulkMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

const STATUS_CONFIG: Record<
  ImageGenerationStatus,
  { label: string; className: string; icon: typeof Clock }
> = {
  pending: {
    label: "Pending",
    className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    icon: Clock,
  },
  processing: {
    label: "Processing",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    icon: Loader2,
  },
  completed: {
    label: "Completed",
    className: "bg-green-500/10 text-green-600 border-green-500/20",
    icon: ImageIcon,
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/10 text-red-600 border-red-500/20",
    icon: AlertCircle,
  },
};

export function ImageCard({
  generation,
  onView,
  onDelete,
  onDownload,
  bulkMode = false,
  selected = false,
  onSelect,
}: ImageCardProps) {
  const DEFAULT_STATUS = {
    label: generation.status ?? "Unknown",
    className: "bg-muted text-muted-foreground border-muted",
    icon: ImageIcon,
  };
  const status = STATUS_CONFIG[generation.status] ?? DEFAULT_STATUS;
  const StatusIcon = status.icon;
  const isLoading =
    generation.status === "pending" || generation.status === "processing";
  const isCompleted =
    generation.status === "completed" && generation.result_images.length > 0;
  const createdAt = generation.created_at
    ? new Date(generation.created_at).toLocaleString()
    : null;

  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3 space-y-2 transition-colors",
        bulkMode && selected && "ring-2 ring-primary border-primary"
      )}
      onClick={bulkMode ? () => onSelect?.(generation.id) : undefined}
    >
      <div className="relative aspect-square overflow-hidden rounded-md border bg-muted/30 group">
        {bulkMode && (
          <div className="absolute top-2 left-2 z-10">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect?.(generation.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              aria-label={`Select generation ${generation.id}`}
            />
          </div>
        )}
        {isLoading && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Generating...</span>
          </div>
        )}

        {isCompleted && (
          <>
            <img
              src={generation.result_images[0]}
              alt={generation.prompt}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 hidden items-center justify-center gap-2 bg-black/50 group-hover:flex">
              <Button size="icon" variant="secondary" onClick={(e) => { e.stopPropagation(); onView(); }}>
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                onClick={(e) => { e.stopPropagation(); onDownload?.(); }}
                disabled={!onDownload}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {generation.status === "failed" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-xs text-muted-foreground line-clamp-2">
              {generation.error_message || "Generation failed"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remove
            </Button>
          </div>
        )}

        {!isLoading && !isCompleted && generation.status !== "failed" && (
          <Skeleton className="h-full w-full" />
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            className={cn("text-[10px] gap-1", status.className)}
          >
            <StatusIcon
              className={cn(
                "h-3 w-3",
                generation.status === "processing" && "animate-spin"
              )}
            />
            {status.label}
          </Badge>

          <span className="text-[10px] text-muted-foreground capitalize">
            {generation.workflow_type}
          </span>
        </div>

        <p className="text-xs font-medium line-clamp-2">{generation.prompt}</p>

        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="capitalize">{status.label}</span>
          {createdAt && <span className="truncate">{createdAt}</span>}
        </div>
      </div>
    </div>
  );
}
