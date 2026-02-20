"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import { TimelineRuler } from "./timeline-ruler";
import { TimelineTrack } from "./timeline-track";
import { TimelineControls } from "./timeline-controls";
import { useStudioStore, generateClipId } from "../use-studio-store";
import type { TimelineClip } from "../use-studio-store";

export function TimelinePanel() {
  const {
    timeline,
    pixelsPerSecond,
    scrollLeft,
    currentTime,
    setScrollLeft,
    addClip,
    moveClip,
    addTrack,
    selectClip,
    setCurrentTime,
  } = useStudioStore();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    obs.observe(el);
    setContainerWidth(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // Handle drop from media bin → timeline or clip reposition
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;

      // Media bin → timeline track (new clip)
      if (activeData?.type === "media-asset" && overData?.type === "timeline-track") {
        const asset = activeData.asset;
        const trackId = overData.trackId as string;
        const track = timeline.tracks.find((t) => t.id === trackId);
        if (!track) return;

        // Only allow compatible types
        if (
          asset.media_type !== track.type &&
          !(asset.media_type === "video" && track.type === "image")
        ) {
          return;
        }

        const newClip: TimelineClip = {
          id: generateClipId(),
          type: asset.media_type as TimelineClip["type"],
          media_asset_id: asset.id,
          start_time: overData.dropTime ?? 0,
          duration: asset.duration_seconds || 5,
          trim_start: 0,
          properties: {
            opacity: 1,
            volume: 1,
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
          },
        };

        addClip(trackId, newClip);
        selectClip(newClip.id, trackId);
      }

      // Clip reposition within/across tracks
      if (activeData?.type === "timeline-clip" && overData?.type === "timeline-track") {
        const clipId = activeData.clipId as string;
        const fromTrackId = activeData.trackId as string;
        const toTrackId = overData.trackId as string;

        // Calculate new start time from drop position
        const delta = event.delta.x;
        const timeDelta = delta / pixelsPerSecond;
        const clip = timeline.tracks
          .find((t) => t.id === fromTrackId)
          ?.clips.find((c) => c.id === clipId);

        if (clip) {
          const newStartTime = Math.max(0, clip.start_time + timeDelta);
          moveClip(fromTrackId, toTrackId, clipId, newStartTime);
        }
      }
    },
    [timeline, pixelsPerSecond, addClip, moveClip, selectClip],
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollLeft(e.currentTarget.scrollLeft);
    },
    [setScrollLeft],
  );

  // Click on empty area to seek
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollLeft;
      const time = x / pixelsPerSecond;
      setCurrentTime(Math.max(0, time));
    },
    [pixelsPerSecond, scrollLeft, setCurrentTime],
  );

  // Compute timeline width
  let maxTime = 30; // minimum 30s visible
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      maxTime = Math.max(maxTime, clip.start_time + clip.duration + 5);
    }
  }
  const timelineWidth = maxTime * pixelsPerSecond;

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <div className="flex h-full flex-col border-t bg-card">
        {/* Controls bar */}
        <TimelineControls containerWidth={containerWidth} />

        {/* Scrollable timeline area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
          <div style={{ width: timelineWidth, minHeight: "100%" }}>
            {/* Ruler */}
            <TimelineRuler width={timelineWidth} />

            {/* Playhead line */}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-red-500"
              style={{
                left: currentTime * pixelsPerSecond,
              }}
            />

            {/* Tracks */}
            <div className="relative" onClick={handleTimelineClick}>
              {timeline.tracks.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Add a track to get started. Drag media from the library onto tracks.
                </div>
              ) : (
                timeline.tracks.map((track) => <TimelineTrack key={track.id} track={track} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}
