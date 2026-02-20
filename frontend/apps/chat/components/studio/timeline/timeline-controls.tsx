"use client";

import { useCallback } from "react";
import { Button } from "@workstation/ui";
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Film,
  Music,
  Type,
  Image as ImageIcon,
  Captions,
} from "lucide-react";
import { useStudioStore } from "../use-studio-store";

interface TimelineControlsProps {
  containerWidth?: number;
}

export function TimelineControls({ containerWidth }: TimelineControlsProps) {
  const { pixelsPerSecond, setPixelsPerSecond, addTrack, timeline, fitToWindow } = useStudioStore();

  const zoomIn = useCallback(() => {
    setPixelsPerSecond(pixelsPerSecond * 1.3);
  }, [pixelsPerSecond, setPixelsPerSecond]);

  const zoomOut = useCallback(() => {
    setPixelsPerSecond(pixelsPerSecond / 1.3);
  }, [pixelsPerSecond, setPixelsPerSecond]);

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b bg-card px-2">
      <span className="mr-1 text-[10px] text-muted-foreground">Tracks:</span>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("video")}
        title="Add video track"
      >
        <Film className="mr-1 h-3 w-3" />
        Video
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("audio")}
        title="Add audio track"
      >
        <Music className="mr-1 h-3 w-3" />
        Audio
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("text")}
        title="Add text track"
      >
        <Type className="mr-1 h-3 w-3" />
        Text
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("image")}
        title="Add image track"
      >
        <ImageIcon className="mr-1 h-3 w-3" />
        Image
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("subtitle", "Subtitles")}
        title="Add subtitle track"
      >
        <Captions className="mr-1 h-3 w-3" />
        Subtitles
      </Button>

      <div className="flex-1" />

      <span className="text-[10px] text-muted-foreground">
        {timeline.tracks.length} track{timeline.tracks.length !== 1 ? "s" : ""}
      </span>

      <div className="mx-1 h-4 w-px bg-border" />

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-[10px]"
        onClick={() => containerWidth && fitToWindow(containerWidth)}
        title="Fit timeline to window"
        disabled={!containerWidth}
      >
        <Maximize2 className="mr-0.5 h-3 w-3" />
        Fit
      </Button>

      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={zoomOut} title="Zoom out">
        <ZoomOut className="h-3 w-3" />
      </Button>

      <span className="w-8 text-center text-[10px] text-muted-foreground">
        {Math.round(pixelsPerSecond)}
      </span>

      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={zoomIn} title="Zoom in">
        <ZoomIn className="h-3 w-3" />
      </Button>
    </div>
  );
}
