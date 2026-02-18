"use client";

import { useCallback } from "react";
import { Button } from "@workstation/ui";
import { Plus, ZoomIn, ZoomOut, Film, Music, Type, Image as ImageIcon, Captions } from "lucide-react";
import { useStudioStore } from "../use-studio-store";

export function TimelineControls() {
  const { pixelsPerSecond, setPixelsPerSecond, addTrack, timeline } =
    useStudioStore();

  const zoomIn = useCallback(() => {
    setPixelsPerSecond(pixelsPerSecond * 1.3);
  }, [pixelsPerSecond, setPixelsPerSecond]);

  const zoomOut = useCallback(() => {
    setPixelsPerSecond(pixelsPerSecond / 1.3);
  }, [pixelsPerSecond, setPixelsPerSecond]);

  return (
    <div className="h-8 border-b flex items-center gap-1 px-2 shrink-0 bg-card">
      <span className="text-[10px] text-muted-foreground mr-1">Tracks:</span>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("video")}
        title="Add video track"
      >
        <Film className="w-3 h-3 mr-1" />
        Video
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("audio")}
        title="Add audio track"
      >
        <Music className="w-3 h-3 mr-1" />
        Audio
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("text")}
        title="Add text track"
      >
        <Type className="w-3 h-3 mr-1" />
        Text
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("image")}
        title="Add image track"
      >
        <ImageIcon className="w-3 h-3 mr-1" />
        Image
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => addTrack("subtitle", "Subtitles")}
        title="Add subtitle track"
      >
        <Captions className="w-3 h-3 mr-1" />
        Subtitles
      </Button>

      <div className="flex-1" />

      <span className="text-[10px] text-muted-foreground">
        {timeline.tracks.length} track{timeline.tracks.length !== 1 ? "s" : ""}
      </span>

      <div className="h-4 w-px bg-border mx-1" />

      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={zoomOut}
        title="Zoom out"
      >
        <ZoomOut className="w-3 h-3" />
      </Button>

      <span className="text-[10px] text-muted-foreground w-8 text-center">
        {Math.round(pixelsPerSecond)}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={zoomIn}
        title="Zoom in"
      >
        <ZoomIn className="w-3 h-3" />
      </Button>
    </div>
  );
}
