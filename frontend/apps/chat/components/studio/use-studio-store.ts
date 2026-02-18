import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClipProperties {
  opacity?: number;
  volume?: number;
  position?: { x: number; y: number };
  scale?: { x: number; y: number };
  // Text-specific
  text?: string;
  font_family?: string;
  font_size?: number;
  color?: string;
  // Link (any clip can be a clickable hotspot in HTML export)
  url?: string;
  link_label?: string;
  // Subtitle-specific
  subtitle_text?: string;
  subtitle_style?: "bottom-center" | "top-center" | "custom";
  background_opacity?: number;
}

export interface TimelineClip {
  id: string;
  type: "video" | "audio" | "text" | "image" | "subtitle";
  media_asset_id: string | null;
  start_time: number;
  duration: number;
  trim_start?: number;
  trim_end?: number;
  properties: ClipProperties;
}

export interface TimelineTrack {
  id: string;
  type: "video" | "audio" | "text" | "image" | "subtitle";
  name: string;
  order: number;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  clips: TimelineClip[];
}

export interface TimelineData {
  version: number;
  settings: {
    width: number;
    height: number;
    fps: number;
    background_color: string;
  };
  tracks: TimelineTrack[];
}

export interface MediaAsset {
  id: string;
  filename: string;
  media_type: "video" | "audio" | "image";
  mime_type: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface StudioState {
  // Project
  projectId: string | null;
  projectName: string;
  isDirty: boolean;

  // Timeline
  timeline: TimelineData;
  selectedClipId: string | null;
  selectedTrackId: string | null;

  // Playback
  currentTime: number;
  isPlaying: boolean;
  duration: number;

  // Zoom & scroll
  pixelsPerSecond: number;
  scrollLeft: number;

  // Media library
  mediaAssets: MediaAsset[];

  // Actions — Project
  setProjectId: (id: string | null) => void;
  setProjectName: (name: string) => void;
  setTimeline: (data: TimelineData) => void;
  markDirty: () => void;
  markClean: () => void;

  // Actions — Timeline
  addTrack: (type: TimelineTrack["type"], name?: string) => void;
  removeTrack: (trackId: string) => void;
  addClip: (trackId: string, clip: TimelineClip) => void;
  updateClip: (trackId: string, clipId: string, updates: Partial<TimelineClip>) => void;
  removeClip: (trackId: string, clipId: string) => void;
  moveClip: (fromTrackId: string, toTrackId: string, clipId: string, newStartTime: number) => void;

  // Actions — Selection
  selectClip: (clipId: string | null, trackId?: string | null) => void;

  // Actions — Playback
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;

  // Actions — Zoom
  setPixelsPerSecond: (pps: number) => void;
  setScrollLeft: (px: number) => void;

  // Actions — Media
  setMediaAssets: (assets: MediaAsset[]) => void;
  addMediaAsset: (asset: MediaAsset) => void;
  removeMediaAsset: (id: string) => void;

  // Helpers
  getSelectedClip: () => { track: TimelineTrack; clip: TimelineClip } | null;
}

const DEFAULT_TIMELINE: TimelineData = {
  version: 1,
  settings: { width: 1920, height: 1080, fps: 30, background_color: "#000000" },
  tracks: [],
};

let trackCounter = 0;
let clipCounter = 0;
function nextTrackId() { return `track-${++trackCounter}-${Date.now()}`; }
function nextClipId() { return `clip-${++clipCounter}-${Date.now()}`; }

export const useStudioStore = create<StudioState>((set, get) => ({
  // Initial state
  projectId: null,
  projectName: "Untitled Project",
  isDirty: false,
  timeline: DEFAULT_TIMELINE,
  selectedClipId: null,
  selectedTrackId: null,
  currentTime: 0,
  isPlaying: false,
  duration: 0,
  pixelsPerSecond: 100,
  scrollLeft: 0,
  mediaAssets: [],

  // Project actions
  setProjectId: (id) => set({ projectId: id }),
  setProjectName: (name) => set({ projectName: name, isDirty: true }),
  setTimeline: (data) => set({ timeline: data }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  // Timeline actions
  addTrack: (type, name) => {
    const id = nextTrackId();
    const defaultName = name || `${type.charAt(0).toUpperCase() + type.slice(1)} Track`;
    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: [
          ...state.timeline.tracks,
          {
            id,
            type,
            name: defaultName,
            order: state.timeline.tracks.length,
            muted: false,
            locked: false,
            visible: true,
            clips: [],
          },
        ],
      },
      isDirty: true,
    }));
  },

  removeTrack: (trackId) => {
    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.filter((t) => t.id !== trackId),
      },
      isDirty: true,
      selectedTrackId: state.selectedTrackId === trackId ? null : state.selectedTrackId,
      selectedClipId: state.timeline.tracks
        .find((t) => t.id === trackId)
        ?.clips.some((c) => c.id === state.selectedClipId)
        ? null
        : state.selectedClipId,
    }));
  },

  addClip: (trackId, clip) => {
    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t
        ),
      },
      isDirty: true,
    }));
  },

  updateClip: (trackId, clipId, updates) => {
    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId ? { ...c, ...updates } : c
                ),
              }
            : t
        ),
      },
      isDirty: true,
    }));
  },

  removeClip: (trackId, clipId) => {
    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.map((t) =>
          t.id === trackId
            ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
            : t
        ),
      },
      isDirty: true,
      selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
    }));
  },

  moveClip: (fromTrackId, toTrackId, clipId, newStartTime) => {
    set((state) => {
      const fromTrack = state.timeline.tracks.find((t) => t.id === fromTrackId);
      const clip = fromTrack?.clips.find((c) => c.id === clipId);
      if (!clip) return state;

      const movedClip = { ...clip, start_time: Math.max(0, newStartTime) };

      return {
        timeline: {
          ...state.timeline,
          tracks: state.timeline.tracks.map((t) => {
            if (t.id === fromTrackId && fromTrackId !== toTrackId) {
              return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
            }
            if (t.id === toTrackId) {
              const clips =
                fromTrackId === toTrackId
                  ? t.clips.map((c) => (c.id === clipId ? movedClip : c))
                  : [...t.clips, movedClip];
              return { ...t, clips };
            }
            return t;
          }),
        },
        isDirty: true,
      };
    });
  },

  // Selection
  selectClip: (clipId, trackId) =>
    set({
      selectedClipId: clipId,
      selectedTrackId: trackId ?? null,
    }),

  // Playback
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (duration) => set({ duration }),

  // Zoom
  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: Math.max(10, Math.min(500, pps)) }),
  setScrollLeft: (px) => set({ scrollLeft: Math.max(0, px) }),

  // Media
  setMediaAssets: (assets) => set({ mediaAssets: assets }),
  addMediaAsset: (asset) =>
    set((state) => ({ mediaAssets: [asset, ...state.mediaAssets] })),
  removeMediaAsset: (id) =>
    set((state) => ({ mediaAssets: state.mediaAssets.filter((a) => a.id !== id) })),

  // Helpers
  getSelectedClip: () => {
    const { timeline, selectedClipId } = get();
    if (!selectedClipId) return null;
    for (const track of timeline.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return { track, clip };
    }
    return null;
  },
}));

// Utility: generate a new clip ID for external use
export function generateClipId(): string {
  return nextClipId();
}
