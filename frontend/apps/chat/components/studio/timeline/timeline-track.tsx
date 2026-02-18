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
  video: <Film className="w-3 h-3" />,
  audio: <Music className="w-3 h-3" />,
  text: <Type className="w-3 h-3" />,
  image: <ImageIcon className="w-3 h-3" />,
  subtitle: <Captions className="w-3 h-3" />,
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
      t.id === track.id ? { ...t, muted: !t.muted } : t
    );
    state.setTimeline({ ...state.timeline, tracks });
  }, [track.id]);

  const toggleVisible = useCallback(() => {
    const state = useStudioStore.getState();
    const tracks = state.timeline.tracks.map((t) =>
      t.id === track.id ? { ...t, visible: !t.visible } : t
    );
    state.setTimeline({ ...state.timeline, tracks });
  }, [track.id]);

  const toggleLocked = useCallback(() => {
    const state = useStudioStore.getState();
    const tracks = state.timeline.tracks.map((t) =>
      t.id === track.id ? { ...t, locked: !t.locked } : t
    );
    state.setTimeline({ ...state.timeline, tracks });
  }, [track.id]);

  return (
    <div
      className={`flex border-b ${isOver ? "bg-primary/5" : ""}`}
      style={{ height: TRACK_HEIGHT }}
    >
      {/* Track header */}
      <div className="w-40 shrink-0 flex items-center gap-1 px-2 border-r bg-card">
        <span className="text-muted-foreground">{TRACK_ICONS[track.type]}</span>
        <span className="text-xs truncate flex-1">{track.name}</span>
        <div className="flex gap-0.5">
          <button
            onClick={toggleMuted}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground"
            title={track.muted ? "Unmute" : "Mute"}
          >
            {track.muted ? (
              <VolumeX className="w-3 h-3" />
            ) : (
              <Volume2 className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={toggleVisible}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground"
            title={track.visible ? "Hide" : "Show"}
          >
            {track.visible ? (
              <Eye className="w-3 h-3" />
            ) : (
              <EyeOff className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={toggleLocked}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground"
            title={track.locked ? "Unlock" : "Lock"}
          >
            {track.locked ? (
              <Lock className="w-3 h-3" />
            ) : (
              <Unlock className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={() => removeTrack(track.id)}
            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Delete track"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Clip area */}
      <div
        ref={setNodeRef}
        className="flex-1 relative"
        style={{ minWidth: 0 }}
      >
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
