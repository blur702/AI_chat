"use client";

import { useCallback, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useStudioStore } from "../use-studio-store";
import type { TimelineClip } from "../use-studio-store";

interface TimelineClipBlockProps {
  clip: TimelineClip;
  trackId: string;
  trackType: string;
  pixelsPerSecond: number;
  locked: boolean;
}

const CLIP_COLORS: Record<string, string> = {
  video: "bg-blue-600/70 border-blue-400/50 hover:bg-blue-600/80",
  audio: "bg-green-600/70 border-green-400/50 hover:bg-green-600/80",
  text: "bg-yellow-600/70 border-yellow-400/50 hover:bg-yellow-600/80",
  image: "bg-purple-600/70 border-purple-400/50 hover:bg-purple-600/80",
  subtitle: "bg-cyan-600/70 border-cyan-400/50 hover:bg-cyan-600/80",
};

export function TimelineClipBlock({
  clip,
  trackId,
  trackType,
  pixelsPerSecond,
  locked,
}: TimelineClipBlockProps) {
  const { selectedClipId, selectClip, updateClip } = useStudioStore();
  const isSelected = selectedClipId === clip.id;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `clip-${clip.id}`,
    data: { type: "timeline-clip", clipId: clip.id, trackId },
    disabled: locked,
  });

  // Trim handle dragging
  const [trimming, setTrimming] = useState<"left" | "right" | null>(null);
  const trimStartRef = useRef({ x: 0, startTime: 0, duration: 0 });

  const handleTrimStart = useCallback(
    (side: "left" | "right", e: React.MouseEvent) => {
      e.stopPropagation();
      if (locked) return;

      setTrimming(side);
      trimStartRef.current = {
        x: e.clientX,
        startTime: clip.start_time,
        duration: clip.duration,
      };

      const handleMove = (moveE: MouseEvent) => {
        const dx = moveE.clientX - trimStartRef.current.x;
        const timeDelta = dx / pixelsPerSecond;

        if (side === "left") {
          const newStart = Math.max(0, trimStartRef.current.startTime + timeDelta);
          const newDuration = trimStartRef.current.duration - timeDelta;
          if (newDuration > 0.1) {
            updateClip(trackId, clip.id, {
              start_time: newStart,
              duration: newDuration,
              trim_start: (clip.trim_start || 0) + (newStart - clip.start_time),
            });
          }
        } else {
          const newDuration = Math.max(0.1, trimStartRef.current.duration + timeDelta);
          updateClip(trackId, clip.id, { duration: newDuration });
        }
      };

      const handleUp = () => {
        setTrimming(null);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [clip, trackId, pixelsPerSecond, locked, updateClip]
  );

  const left = clip.start_time * pixelsPerSecond;
  const width = Math.max(clip.duration * pixelsPerSecond, 4);
  const clipType = clip.type || trackType;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectClip(clip.id, trackId);
    },
    [clip.id, trackId, selectClip]
  );

  // Display label
  let label = "";
  if (clipType === "text") {
    label = clip.properties.text?.slice(0, 20) || "Text";
  } else if (clipType === "subtitle") {
    label = clip.properties.subtitle_text?.slice(0, 25) || "Subtitle";
  } else {
    label = clipType;
  }

  return (
    <div
      ref={setNodeRef}
      {...(locked ? {} : { ...listeners, ...attributes })}
      className={`absolute top-1 bottom-1 rounded border text-[10px] text-white/90 cursor-grab select-none flex items-center overflow-hidden ${
        CLIP_COLORS[clipType] || CLIP_COLORS.video
      } ${isSelected ? "ring-2 ring-white/60" : ""} ${
        isDragging ? "opacity-50 z-50" : "z-10"
      }`}
      style={{ left, width }}
      onClick={handleClick}
    >
      {/* Left trim handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 z-20"
        onMouseDown={(e) => handleTrimStart("left", e)}
      />

      {/* Clip content */}
      <span className="px-2 truncate pointer-events-none">{label}</span>

      {/* Right trim handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/30 z-20"
        onMouseDown={(e) => handleTrimStart("right", e)}
      />
    </div>
  );
}
