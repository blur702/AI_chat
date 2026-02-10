"use client";

import { Button, ScrollArea } from "@workstation/ui";
import { ImageIcon, X } from "lucide-react";
import { ImageGallery } from "./image-gallery";

interface ImageGenPanelProps {
  projectId: string;
  onClose: () => void;
}

export function ImageGenPanel({ projectId, onClose }: ImageGenPanelProps) {
  return (
    <div className="flex h-full flex-col border-l">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" />
          Image Gallery
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          <ImageGallery projectId={projectId} />
        </div>
      </ScrollArea>
    </div>
  );
}

