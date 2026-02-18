"use client";

import { useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  Film,
  Music,
  Image as ImageIcon,
  Type,
  Captions,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Trash2,
} from "lucide-react";
import { TimelineClipBlock } from "./timeline-clip";
import { useStudioStore } from "../use-studio-store";
import type { TimelineTrack as TrackType } from "../use-studio-store";

interface TimelineTrackProps {
  track: TrackType;
}

const TRACK_HEIGHT = 56;

const TRACK_ICONS: Record<string, React.ReactNode> = {
  video: <Film className="h-3 w-3" />,
  audio: <Music className="h-3 w-3" />,
  text: <Type className="h-3 w-3" />,
  image: <ImageIcon className="h-3 w-3" />,
  subtitle: <Captions className="h-3 w-3" />,
};

const TRACK_COLORS: Record<string, string> = {
  video: "bg-blue-500/20 border-blue-500/40",
  audio: "bg-green-500/20 border-green-500/40",
  text: "bg-yellow-500/20 border-yellow-500/40",
  image: "bg-purple-500/20 border-purple-500/40",
  subtitle: "bg-cyan-500/20 border-cyan-500/40",
};

export function TimelineTrack({ track }: TimelineTrackProps) {
  const { updateClip, removeTrack, pixelsPerSecond } = useStudioStore();

  const { setNodeRef, isOver } = useDroppable({
    id: `track-${track.id}`,
    data: { type: "timeline-track", trackId: track.id },
  });

  const toggleMuted = useCallback(() => {
    // We need to update via store - for now we'll use a direct approach
    const state = useStudioStore.getState();
    const tracks = state.timeline.tracks.map((t) =>
      t.id === track.id ? { ...t, muted: !t.muted } : t,
    );
    state.setTimeline({ ...state.timeline, tracks });
  }, [track.id]);

  const toggleVisible = useCallback(() => {
    const state = useStudioStore.getState();
    const tracks = state.timeline.tracks.map((t) =>
      t.id === track.id ? { ...t, visible: !t.visible } : t,
    );
    state.setTimeline({ ...state.timeline, tracks });
  }, [track.id]);

  const toggleLocked = useCallback(() => {
    const state = useStudioStore.getState();
    const tracks = state.timeline.tracks.map((t) =>
      t.id === track.id ? { ...t, locked: !t.locked } : t,
    );
    state.setTimeline({ ...state.timeline, tracks });
  }, [track.id]);

  return (
    <div
      className={`flex border-b ${isOver ? "bg-primary/5" : ""}`}
      style={{ height: TRACK_HEIGHT }}
    >
      {/* Track header */}
      <div className="flex w-40 shrink-0 items-center gap-1 border-r bg-card px-2">
        <span className="text-muted-foreground">{TRACK_ICONS[track.type]}</span>
        <span className="flex-1 truncate text-xs">{track.name}</span>
        <div className="flex gap-0.5">
          <button
            onClick={toggleMuted}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            title={track.muted ? "Unmute" : "Mute"}
          >
            {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>
          <button
            onClick={toggleVisible}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            title={track.visible ? "Hide" : "Show"}
          >
            {track.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          <button
            onClick={toggleLocked}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            title={track.locked ? "Unlock" : "Lock"}
          >
            {track.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          </button>
          <button
            onClick={() => removeTrack(track.id)}
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Delete track"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Clip area */}
      <div ref={setNodeRef} className="relative flex-1" style={{ minWidth: 0 }}>
        {track.clips.map((clip) => (
          <TimelineClipBlock
            key={clip.id}
            clip={clip}
            trackId={track.id}
            trackType={track.type}
            pixelsPerSecond={pixelsPerSecond}
            locked={track.locked}
          />
        ))}
      </div>
    </div>
  );
}
