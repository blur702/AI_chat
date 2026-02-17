"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  Download,
  ImageIcon,
  RefreshCw,
  Square,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@workstation/ui";
import {
  useImageGeneration,
  useServiceStatus,
  type UseImageGenerationReturn,
} from "@workstation/api/hooks";
import { getClient } from "@workstation/api";
import type {
  ImageGenerationResponse,
  ImageGenerationStatus,
} from "@workstation/api/types";
import { ImageCard } from "./image-card";
import { ImageViewer } from "./image-viewer";

interface ImageGalleryProps {
  projectId: string;
  hookState?: UseImageGenerationReturn;
  onRegenerate?: (generation: ImageGenerationResponse) => void;
}

type SortOrder = "newest" | "oldest";

const FILTERS: Array<{ label: string; value: ImageGenerationStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
];


const PAGE_SIZE = 20;

function getFilenameFromUrl(url: string): string {
  const path = url.split("?")[0];
  return path.substring(path.lastIndexOf("/") + 1) || "image.png";
}

export function ImageGallery({ projectId, hookState, onRegenerate }: ImageGalleryProps) {
  const internalHook = useImageGeneration(hookState ? null : projectId);
  const { services, refresh: refreshServiceStatus } = useServiceStatus();
  const hook = hookState ?? internalHook;
  const {
    generations,
    loading,
    error,
    totalCount,
    currentPage,
    filterStatus,
    refresh,
    deleteGeneration,
    bulkDelete,
    downloadImage,
    setPage,
    setFilter,
    toggleFavorite,
    upscaleGeneration,
  } = hook;

  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [selectedGeneration, setSelectedGeneration] =
    useState<ImageGenerationResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImageGenerationResponse | null>(
    null
  );
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [startingComfyUI, setStartingComfyUI] = useState(false);
  const [comfyuiMessage, setComfyuiMessage] = useState<string | null>(null);
  const [comfyuiError, setComfyuiError] = useState<string | null>(null);
  const [comfyuiStartupSeconds, setComfyuiStartupSeconds] = useState(0);

  const comfyuiDetail = services.find((s) => s.name === "comfyui_client")?.detail ?? null;
  const comfyuiHealthy = comfyuiDetail?.healthy === true;
  const comfyuiHealthMessage = comfyuiDetail?.message ?? null;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(generations.map((g) => g.id)));
  }, [generations]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      await bulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, bulkDelete]);

  const handleBulkDownload = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDownloading(true);
    try {
      const selected = generations.filter(
        (g) => selectedIds.has(g.id) && g.status === "completed" && g.result_images.length > 0
      );
      for (const gen of selected) {
        const image = gen.result_images[0];
        if (image) {
          await downloadImage(gen.id, getFilenameFromUrl(image));
        }
      }
    } finally {
      setBulkDownloading(false);
    }
  }, [selectedIds, generations, downloadImage]);

  const sortedGenerations = useMemo(() => {
    let filtered = [...generations];
    if (showFavoritesOnly) {
      filtered = filtered.filter((g) => g.is_favorite);
    }
    filtered.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
    });
    return filtered;
  }, [generations, sortOrder, showFavoritesOnly]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const startComfyUI = useCallback(async () => {
    if (startingComfyUI) return;
    setComfyuiError(null);
    setComfyuiStartupSeconds(0);
    setComfyuiMessage("Starting ComfyUI container...");
    setStartingComfyUI(true);
    try {
      const result = await getClient().startComfyUI();
      setComfyuiMessage(result.message);
      await refreshServiceStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start ComfyUI";
      setComfyuiError(message);
      setStartingComfyUI(false);
    }
  }, [refreshServiceStatus, startingComfyUI]);

  useEffect(() => {
    if (!startingComfyUI) return;
    if (comfyuiHealthy) {
      setStartingComfyUI(false);
      setComfyuiMessage("ComfyUI is ready.");
      setComfyuiError(null);
      return;
    }
    if (comfyuiHealthMessage) setComfyuiMessage(comfyuiHealthMessage);
  }, [comfyuiHealthMessage, comfyuiHealthy, startingComfyUI]);

  useEffect(() => {
    if (!startingComfyUI) return;
    const timer = setInterval(() => {
      setComfyuiStartupSeconds((seconds) => seconds + 2);
      refreshServiceStatus();
    }, 2000);
    return () => clearInterval(timer);
  }, [refreshServiceStatus, startingComfyUI]);

  const comfyuiStatusMessage = comfyuiError ?? comfyuiMessage ?? comfyuiHealthMessage;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteGeneration(deleteTarget.id);
    if (selectedGeneration?.id === deleteTarget.id) {
      setSelectedGeneration(null);
    }
    setDeleteTarget(null);
  };

  const navigateSelected = (direction: "prev" | "next") => {
    if (!selectedGeneration) return;
    const index = sortedGenerations.findIndex((g) => g.id === selectedGeneration.id);
    if (index < 0) return;

    const nextIndex = direction === "prev" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= sortedGenerations.length) return;
    setSelectedGeneration(sortedGenerations[nextIndex]);
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                variant={filterStatus === filter.value && !showFavoritesOnly ? "secondary" : "ghost"}
                onClick={() => { setShowFavoritesOnly(false); setFilter(filter.value); }}
              >
                {filter.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={showFavoritesOnly ? "secondary" : "ghost"}
              onClick={() => setShowFavoritesOnly((v) => !v)}
            >
              <Star className={`h-3.5 w-3.5 mr-1 ${showFavoritesOnly ? "fill-yellow-400 text-yellow-400" : ""}`} />
              Favorites
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="h-8 text-[11px] capitalize gap-1"
              title={comfyuiStatusMessage ?? undefined}
            >
              {comfyuiHealthy ? (
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              ) : startingComfyUI ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
              )}
              {comfyuiHealthy ? "ComfyUI ready" : startingComfyUI ? "Starting..." : "ComfyUI down"}
            </Badge>
            {!comfyuiHealthy && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void startComfyUI();
                }}
                disabled={startingComfyUI}
              >
                {startingComfyUI ? "Starting..." : "Start ComfyUI"}
              </Button>
            )}
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as SortOrder)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              aria-label="Sort images"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <Button
              size="sm"
              variant={bulkMode ? "secondary" : "outline"}
              onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}
            >
              {bulkMode ? <X className="h-3.5 w-3.5 mr-1" /> : <CheckSquare className="h-3.5 w-3.5 mr-1" />}
              {bulkMode ? "Cancel" : "Select"}
            </Button>
            <Button size="sm" variant="outline" onClick={refresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {!comfyuiHealthy && comfyuiStatusMessage && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-700 dark:text-yellow-400">
            {startingComfyUI
              ? `Starting ComfyUI${comfyuiStartupSeconds > 0 ? ` (${comfyuiStartupSeconds}s)` : ""}: ${comfyuiStatusMessage}`
              : comfyuiStatusMessage}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {bulkMode && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">{selectedIds.size} selected</span>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={selectAll}>
                <CheckSquare className="h-3 w-3 mr-1" />
                All
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={clearSelection} disabled={selectedIds.size === 0}>
                <Square className="h-3 w-3 mr-1" />
                None
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={selectedIds.size === 0 || bulkDownloading}
                onClick={handleBulkDownload}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                {bulkDownloading ? "Downloading..." : "Download"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                disabled={selectedIds.size === 0 || bulkDeleting}
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {bulkDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        )}

        {loading && generations.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[260px] w-full rounded-md" />
            ))}
          </div>
        )}

        {!loading && sortedGenerations.length === 0 && (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No generations found</p>
            <p className="text-xs text-muted-foreground/70">
              Start generating images to see them here.
            </p>
          </div>
        )}

        {sortedGenerations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {sortedGenerations.map((generation) => (
              <ImageCard
                key={generation.id}
                generation={generation}
                onView={() => setSelectedGeneration(generation)}
                onDelete={() => setDeleteTarget(generation)}
                onDownload={() => {
                  const image = generation.result_images[0];
                  if (!image) return;
                  downloadImage(generation.id, getFilenameFromUrl(image));
                }}
                onToggleFavorite={() => toggleFavorite(generation.id)}
                bulkMode={bulkMode}
                selected={selectedIds.has(generation.id)}
                onSelect={toggleSelect}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            {Array.from({ length: totalPages }).map((_, index) => {
              const page = index + 1;
              return (
                <Button
                  key={page}
                  size="sm"
                  variant={currentPage === page ? "secondary" : "ghost"}
                  onClick={() => setPage(page)}
                >
                  {page}
                </Button>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {selectedGeneration && (
        <ImageViewer
          generation={selectedGeneration}
          open={selectedGeneration !== null}
          onOpenChange={(open) => !open && setSelectedGeneration(null)}
          onNavigate={navigateSelected}
          onToggleFavorite={(id) => {
            toggleFavorite(id);
          }}
          onUpscale={(id) => {
            upscaleGeneration(id);
          }}
          onRegenerate={onRegenerate}
        />
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete generation?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove the generated images and metadata.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
