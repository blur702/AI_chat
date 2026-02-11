"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workstation/ui";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Move,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getClient } from "@workstation/api";
import type { ImageGenerationResponse } from "@workstation/api/types";

interface ImageViewerProps {
  generation: ImageGenerationResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (direction: "prev" | "next") => void;
}

type ZoomMode = "fit" | "100" | "200";

function getFilenameFromUrl(url: string): string {
  const path = url.split("?")[0];
  return path.substring(path.lastIndexOf("/") + 1) || "image.png";
}

export function ImageViewer({
  generation,
  open,
  onOpenChange,
  onNavigate,
}: ImageViewerProps) {
  const [zoom, setZoom] = useState<ZoomMode>("fit");
  const [imageIndex, setImageIndex] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragOrigin, setDragOrigin] = useState({ x: 0, y: 0 });

  const images = generation.result_images ?? [];
  const currentImage = images[imageIndex] ?? null;

  useEffect(() => {
    setZoom("fit");
    setImageIndex(0);
    setPan({ x: 0, y: 0 });
  }, [generation.id, open]);

  const scale = useMemo(() => {
    if (zoom === "100") return 1;
    if (zoom === "200") return 2;
    return 1;
  }, [zoom]);

  const handleDownload = useCallback(async () => {
    if (!currentImage) return;
    let url: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const filename = getFilenameFromUrl(currentImage);
      const blob = await getClient().downloadImage(generation.id, filename);
      url = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
    } catch (err) {
      console.error("Failed to download image:", err);
    } finally {
      if (anchor) anchor.remove();
      if (url) URL.revokeObjectURL(url);
    }
  }, [currentImage, generation.id]);

  const navigateImage = useCallback(
    (direction: "prev" | "next") => {
      if (images.length <= 1) {
        onNavigate?.(direction);
        return;
      }

      if (direction === "prev") {
        if (imageIndex > 0) {
          setImageIndex((value) => value - 1);
          return;
        }
        onNavigate?.("prev");
        return;
      }

      if (imageIndex < images.length - 1) {
        setImageIndex((value) => value + 1);
        return;
      }
      onNavigate?.("next");
    },
    [imageIndex, images.length, onNavigate]
  );

  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") navigateImage("prev");
      if (event.key === "ArrowRight") navigateImage("next");
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, navigateImage]);

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (zoom === "fit") return;
    setDragging(true);
    setDragOrigin({
      x: event.clientX - pan.x,
      y: event.clientY - pan.y,
    });
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPan({
      x: event.clientX - dragOrigin.x,
      y: event.clientY - dragOrigin.y,
    });
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0 bg-background">
        <DialogHeader className="sr-only">
          <DialogTitle>Image Viewer</DialogTitle>
        </DialogHeader>

        <div className="flex h-full">
          <div className="flex-1 relative bg-black/90">
            <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
              <Button
                variant={zoom === "fit" ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setZoom("fit");
                  setPan({ x: 0, y: 0 });
                }}
              >
                Fit
              </Button>
              <Button
                variant={zoom === "100" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setZoom("100")}
              >
                <ZoomIn className="h-3.5 w-3.5 mr-1" />
                100%
              </Button>
              <Button
                variant={zoom === "200" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setZoom("200")}
              >
                <ZoomOut className="h-3.5 w-3.5 mr-1" />
                200%
              </Button>
            </div>

            <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!currentImage}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Download
              </Button>
              <Button variant="outline" size="icon" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-md bg-background/80 p-2 hover:bg-background"
              onClick={() => navigateImage("prev")}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-md bg-background/80 p-2 hover:bg-background"
              onClick={() => navigateImage("next")}
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <div
              className="h-full w-full overflow-hidden flex items-center justify-center"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {currentImage ? (
                <img
                  src={currentImage}
                  alt={generation.prompt}
                  className={zoom === "fit" ? "max-h-full max-w-full object-contain" : "object-contain"}
                  style={{
                    transform:
                      zoom === "fit"
                        ? "translate(0px, 0px) scale(1)"
                        : `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    cursor: zoom === "fit" ? "default" : dragging ? "grabbing" : "grab",
                    transition: dragging ? "none" : "transform 120ms ease-out",
                  }}
                />
              ) : (
                <div className="text-sm text-muted-foreground">No image available</div>
              )}
            </div>

            {zoom !== "fit" && (
              <div className="absolute bottom-3 left-3 z-10 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground flex items-center gap-1">
                <Move className="h-3.5 w-3.5" />
                Drag to pan
              </div>
            )}
          </div>

          <aside className="w-[320px] border-l bg-background p-4 space-y-4 overflow-y-auto">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Prompt</h3>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {generation.prompt}
              </p>
            </div>

            {generation.negative_prompt && (
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Negative Prompt</h3>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {generation.negative_prompt}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Details</h3>
              <div className="flex flex-wrap gap-2">
                {generation.workflow_type && (
                  <Badge variant="outline">{generation.workflow_type}</Badge>
                )}
                {generation.comfyui_job_id && (
                  <Badge variant="outline">
                    Job {generation.comfyui_job_id}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Status: {generation.status}
              </p>
              {generation.created_at && (
                <p className="text-xs text-muted-foreground">
                  Created: {new Date(generation.created_at).toLocaleString()}
                </p>
              )}
              {generation.updated_at && (
                <p className="text-xs text-muted-foreground">
                  Updated: {new Date(generation.updated_at).toLocaleString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Image {imageIndex + 1} of {Math.max(images.length, 1)}
              </p>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
