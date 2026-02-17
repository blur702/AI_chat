"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workstation/ui";
import { ImageIcon, Loader2 } from "lucide-react";
import type { ImageGenerationResponse } from "@workstation/api/types";
import { getClient } from "@workstation/api";

interface GalleryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generations: ImageGenerationResponse[];
  onSelect: (base64: string, filename: string) => void;
}

function getFilename(url: string): string {
  const path = url.split("?")[0];
  return path.substring(path.lastIndexOf("/") + 1) || "gallery-image.png";
}

export function GalleryPickerDialog({
  open,
  onOpenChange,
  generations,
  onSelect,
}: GalleryPickerDialogProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const completed = useMemo(
    () => generations.filter((g) => g.status === "completed" && g.result_images.length > 0),
    [generations],
  );

  const handleSelect = useCallback(
    async (generation: ImageGenerationResponse) => {
      const imageUrl = generation.result_images[0];
      if (!imageUrl) return;

      setLoadingId(generation.id);
      try {
        const filename = getFilename(imageUrl);
        const blob = await getClient().downloadImage(generation.id, filename);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        onSelect(base64, filename);
        onOpenChange(false);
      } catch (err) {
        console.error("Failed to load gallery image:", err);
      } finally {
        setLoadingId(null);
      }
    },
    [onSelect, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Pick from Gallery</DialogTitle>
        </DialogHeader>
        {completed.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No completed generations yet</p>
            <p className="text-xs text-muted-foreground/70">
              Generate some images first, then pick them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 overflow-auto pr-1 pb-1">
            {completed.map((gen) => {
              const isLoading = loadingId === gen.id;
              return (
                <button
                  key={gen.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleSelect(gen)}
                  className="group relative aspect-square rounded-md border overflow-hidden hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary transition-all disabled:opacity-60"
                >
                  {/* result_images URLs are served by the backend and accessible in the browser */}
                  <img
                    src={gen.result_images[0]}
                    alt={gen.prompt?.slice(0, 60) || "Generated image"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">
                      {gen.prompt?.slice(0, 40) || "Image"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
