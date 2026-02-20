"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@workstation/ui";
import { Upload, Film, Music, Image as ImageIcon, Trash2, Monitor } from "lucide-react";
import { useStudioStore } from "./use-studio-store";
import { ScreenRecorder } from "./screen-recorder";
import { useDraggable } from "@dnd-kit/core";

interface MediaBinProps {
  projectId: string;
}

function DraggableMediaItem({
  asset,
  onDelete,
}: {
  asset: { id: string; filename: string; media_type: string; duration_seconds: number | null };
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `media-${asset.id}`,
    data: { type: "media-asset", asset },
  });

  const icon =
    asset.media_type === "video" ? (
      <Film className="h-4 w-4 text-blue-400" />
    ) : asset.media_type === "audio" ? (
      <Music className="h-4 w-4 text-green-400" />
    ) : (
      <ImageIcon className="h-4 w-4 text-yellow-400" />
    );

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group flex cursor-grab items-center gap-2 rounded p-2 hover:bg-muted ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs">{asset.filename}</p>
        {asset.duration_seconds != null && (
          <p className="text-[10px] text-muted-foreground">
            {Math.floor(asset.duration_seconds / 60)}:
            {Math.floor(asset.duration_seconds % 60)
              .toString()
              .padStart(2, "0")}
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(asset.id);
        }}
        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function MediaBin({ projectId }: MediaBinProps) {
  const { mediaAssets, addMediaAsset, removeMediaAsset } = useStudioStore();
  const [uploading, setUploading] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch(`/api/studio/projects/${projectId}/media`, {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          if (res.ok) {
            const asset = await res.json();
            addMediaAsset(asset);
          }
        } catch (err) {
          console.error("Upload failed:", err);
        }
      }

      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [projectId, addMediaAsset],
  );

  const handleDelete = useCallback(
    async (mediaId: string) => {
      try {
        await fetch(`/api/studio/media/${mediaId}`, {
          method: "DELETE",
          credentials: "include",
        });
        removeMediaAsset(mediaId);
      } catch {
        // ignore
      }
    },
    [removeMediaAsset],
  );

  const handleRecordingDone = useCallback(
    (asset: any) => {
      addMediaAsset(asset);
      setShowRecorder(false);
    },
    [addMediaAsset],
  );

  return (
    <div className="flex h-full flex-col border-r bg-card">
      <div className="border-b p-2">
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Media Library
        </h3>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-1 h-3 w-3" />
            {uploading ? "..." : "Upload"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setShowRecorder(true)}
            title="Record screen"
          >
            <Monitor className="h-3 w-3" />
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="video/*,audio/*,image/*"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {mediaAssets.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <Upload className="mx-auto mb-2 h-8 w-8 opacity-30" />
            Upload or record media to get started
          </div>
        ) : (
          mediaAssets.map((asset) => (
            <DraggableMediaItem key={asset.id} asset={asset} onDelete={handleDelete} />
          ))
        )}
      </div>

      {showRecorder && (
        <ScreenRecorder
          projectId={projectId}
          onDone={handleRecordingDone}
          onCancel={() => setShowRecorder(false)}
        />
      )}
    </div>
  );
}
