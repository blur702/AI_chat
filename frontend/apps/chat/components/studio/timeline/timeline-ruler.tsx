"use client";

import { useMemo } from "react";
import { useStudioStore } from "../use-studio-store";

interface TimelineRulerProps {
  width: number;
}

export function TimelineRuler({ width }: TimelineRulerProps) {
  const { pixelsPerSecond } = useStudioStore();

  const marks = useMemo(() => {
    const result: { time: number; x: number; major: boolean }[] = [];
    // Determine interval based on zoom
    let interval = 1;
    if (pixelsPerSecond < 30) interval = 5;
    else if (pixelsPerSecond < 60) interval = 2;
    else if (pixelsPerSecond > 200) interval = 0.5;

    const totalSeconds = width / pixelsPerSecond;
    for (let t = 0; t <= totalSeconds; t += interval) {
      result.push({
        time: t,
        x: t * pixelsPerSecond,
        major: t % (interval * 5 < 1 ? 1 : Math.ceil(interval * 5)) === 0,
      });
    }
    return result;
  }, [width, pixelsPerSecond]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (seconds < 1 && seconds > 0) {
      return `0.${Math.round(seconds * 10)}s`;
    }
    return m > 0
      ? `${m}:${s.toString().padStart(2, "0")}`
      : `${s}s`;
  };

  return (
    <div
      className="h-6 border-b bg-muted/50 relative select-none"
      style={{ width }}
    >
      {marks.map((mark) => (
        <div
          key={mark.time}
          className="absolute top-0"
          style={{ left: mark.x }}
        >
          <div
            className={`w-px ${
              mark.major ? "h-6 bg-border" : "h-3 bg-border/50"
            }`}
          />
          {mark.major && (
            <span className="absolute top-0.5 left-1 text-[9px] text-muted-foreground whitespace-nowrap">
              {formatTime(mark.time)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
