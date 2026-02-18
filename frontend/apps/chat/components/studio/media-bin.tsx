"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@workstation/ui";
import {
  Upload,
  Film,
  Music,
  Image as ImageIcon,
  Trash2,
  Monitor,
} from "lucide-react";
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
      <Film className="w-4 h-4 text-blue-400" />
    ) : asset.media_type === "audio" ? (
      <Music className="w-4 h-4 text-green-400" />
    ) : (
      <ImageIcon className="w-4 h-4 text-yellow-400" />
    );

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group flex items-center gap-2 p-2 rounded hover:bg-muted cursor-grab ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate">{asset.filename}</p>
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
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="w-3 h-3" />
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

      const token = localStorage.getItem("auth_token");
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch(`/api/studio/projects/${projectId}/media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
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
    [projectId, addMediaAsset]
  );

  const handleDelete = useCallback(
    async (mediaId: string) => {
      const token = localStorage.getItem("auth_token");
      try {
        await fetch(`/api/studio/media/${mediaId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        removeMediaAsset(mediaId);
      } catch {
        // ignore
      }
    },
    [removeMediaAsset]
  );

  const handleRecordingDone = useCallback(
    (asset: any) => {
      addMediaAsset(asset);
      setShowRecorder(false);
    },
    [addMediaAsset]
  );

  return (
    <div className="h-full flex flex-col border-r bg-card">
      <div className="p-2 border-b">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
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
            <Upload className="w-3 h-3 mr-1" />
            {uploading ? "..." : "Upload"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setShowRecorder(true)}
            title="Record screen"
          >
            <Monitor className="w-3 h-3" />
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
          <div className="text-center py-8 text-xs text-muted-foreground">
            <Upload className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Upload or record media to get started
          </div>
        ) : (
          mediaAssets.map((asset) => (
            <DraggableMediaItem
              key={asset.id}
              asset={asset}
              onDelete={handleDelete}
            />
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
