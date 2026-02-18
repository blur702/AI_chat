"use client";

import { useCallback } from "react";
import { Button } from "@workstation/ui";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useStudioStore } from "./use-studio-store";

export function PlaybackControls() {
  const { currentTime, isPlaying, duration, setCurrentTime, setIsPlaying } =
    useStudioStore();

  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const skipBack = useCallback(() => {
    setCurrentTime(Math.max(0, currentTime - 5));
  }, [currentTime, setCurrentTime]);

  const skipForward = useCallback(() => {
    setCurrentTime(Math.min(duration, currentTime + 5));
  }, [currentTime, duration, setCurrentTime]);

  const goToStart = useCallback(() => {
    setCurrentTime(0);
  }, [setCurrentTime]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
  };

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCurrentTime(parseFloat(e.target.value));
    },
    [setCurrentTime]
  );

  return (
    <div className="px-4 py-2 bg-card/80 border-t flex items-center gap-3">
      <Button variant="ghost" size="sm" onClick={goToStart} title="Go to start">
        <SkipBack className="w-4 h-4" />
      </Button>

      <Button variant="ghost" size="sm" onClick={skipBack} title="Back 5s">
        <SkipBack className="w-3 h-3" />
      </Button>

      <Button
        variant="default"
        size="sm"
        onClick={togglePlay}
        title={isPlaying ? "Pause" : "Play"}
        className="w-8 h-8 p-0"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </Button>

      <Button variant="ghost" size="sm" onClick={skipForward} title="Forward 5s">
        <SkipForward className="w-3 h-3" />
      </Button>

      <span className="text-xs font-mono text-muted-foreground min-w-[80px]">
        {formatTime(currentTime)} / {formatTime(duration || 0)}
      </span>

      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={currentTime}
        onChange={handleScrub}
        className="flex-1 h-1 accent-primary"
      />
    </div>
  );
}
