"use client";

import { useRef, useEffect, useCallback } from "react";
import { useStudioStore } from "./use-studio-store";
import { PlaybackControls } from "./playback-controls";
import { PlaybackEngine } from "./playback-engine";

export function PreviewCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const { timeline, currentTime, isPlaying, setCurrentTime, setIsPlaying } = useStudioStore();

  const settings = timeline.settings;

  // Initialize playback engine
  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new PlaybackEngine(containerRef.current, () => {
      setCurrentTime(engine.getCurrentTime());
    });
    engineRef.current = engine;
    return () => engine.destroy();
  }, [setCurrentTime]);

  // Sync timeline to engine
  useEffect(() => {
    engineRef.current?.setTimeline(timeline);
  }, [timeline]);

  // Sync play/pause
  useEffect(() => {
    if (isPlaying) {
      engineRef.current?.play();
    } else {
      engineRef.current?.pause();
    }
  }, [isPlaying]);

  // Sync seek
  useEffect(() => {
    if (!isPlaying) {
      engineRef.current?.seek(currentTime);
    }
  }, [currentTime, isPlaying]);

  return (
    <div className="flex h-full flex-col bg-black/95">
      {/* Video viewport */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        <div
          ref={containerRef}
          className="relative bg-black"
          style={{
            aspectRatio: `${settings.width}/${settings.height}`,
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          {/* PlaybackEngine will inject <video>, <audio>, <div> elements here */}
        </div>
      </div>

      {/* Controls */}
      <PlaybackControls />
    </div>
  );
}
