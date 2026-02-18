"use client";

import { useState, useCallback } from "react";
import { Button, Input } from "@workstation/ui";
import { Plus, Trash2, Wand2, Loader2, Captions } from "lucide-react";
import { useStudioStore, generateClipId } from "./use-studio-store";
import type { TimelineClip, TimelineTrack } from "./use-studio-store";

interface SubtitleSegment {
  start_time: number;
  end_time: number;
  text: string;
}

export function SubtitleEditor({ projectId }: { projectId: string }) {
  const { timeline, addTrack, addClip, updateClip, removeClip, mediaAssets } =
    useStudioStore();

  const [transcribing, setTranscribing] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Find subtitle tracks and their clips
  const subtitleTracks = timeline.tracks.filter((t) => t.type === "subtitle");
  const allSubtitleClips: Array<{ track: TimelineTrack; clip: TimelineClip }> =
    [];
  for (const track of subtitleTracks) {
    for (const clip of track.clips) {
      allSubtitleClips.push({ track, clip });
    }
  }
  allSubtitleClips.sort((a, b) => a.clip.start_time - b.clip.start_time);

  // Audio/video assets available for transcription
  const transcribableAssets = mediaAssets.filter(
    (a) => a.media_type === "video" || a.media_type === "audio"
  );

  // Ensure a subtitle track exists, return its id
  const ensureSubtitleTrack = useCallback((): string => {
    const existing = timeline.tracks.find((t) => t.type === "subtitle");
    if (existing) return existing.id;
    addTrack("subtitle", "Subtitles");
    // Get the newly added track
    const state = useStudioStore.getState();
    const newTrack = state.timeline.tracks.find((t) => t.type === "subtitle");
    return newTrack?.id || "";
  }, [timeline.tracks, addTrack]);

  const addSubtitleClip = useCallback(() => {
    const trackId = ensureSubtitleTrack();
    if (!trackId) return;

    // Find the end time of the last subtitle
    let startTime = 0;
    for (const track of useStudioStore.getState().timeline.tracks) {
      if (track.type !== "subtitle") continue;
      for (const clip of track.clips) {
        const end = clip.start_time + clip.duration;
        if (end > startTime) startTime = end;
      }
    }

    const clip: TimelineClip = {
      id: generateClipId(),
      type: "subtitle",
      media_asset_id: null,
      start_time: startTime,
      duration: 3,
      properties: {
        subtitle_text: "New subtitle",
        font_size: 24,
        color: "#FFFFFF",
        subtitle_style: "bottom-center",
        background_opacity: 0.5,
      },
    };

    addClip(trackId, clip);
  }, [ensureSubtitleTrack, addClip]);

  const handleTranscribe = useCallback(async () => {
    if (!selectedAssetId) return;

    setTranscribing(true);
    setError(null);

    const token = localStorage.getItem("auth_token");
    try {
      const res = await fetch(
        `/api/studio/projects/${projectId}/transcribe?media_asset_id=${selectedAssetId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Transcription failed");
      }

      const data = await res.json();
      const segments: SubtitleSegment[] = data.segments || [];

      if (segments.length === 0) {
        setError("No speech detected in the audio");
        return;
      }

      // Create subtitle clips from segments
      const trackId = ensureSubtitleTrack();
      if (!trackId) return;

      for (const seg of segments) {
        const clip: TimelineClip = {
          id: generateClipId(),
          type: "subtitle",
          media_asset_id: null,
          start_time: seg.start_time,
          duration: seg.end_time - seg.start_time,
          properties: {
            subtitle_text: seg.text,
            font_size: 24,
            color: "#FFFFFF",
            subtitle_style: "bottom-center",
            background_opacity: 0.5,
          },
        };
        addClip(trackId, clip);
      }
    } catch (err: any) {
      setError(err.message || "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  }, [projectId, selectedAssetId, ensureSubtitleTrack, addClip]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 100);
    return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
  };

  return (
    <div className="h-full flex flex-col border-l bg-card">
      <div className="p-3 border-b">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
          <Captions className="w-3.5 h-3.5" />
          Subtitles
        </h3>
      </div>

      {/* Auto-transcribe section */}
      <div className="p-3 border-b space-y-2">
        <p className="text-[10px] font-medium text-muted-foreground">
          Generate from audio
        </p>
        {transcribableAssets.length > 0 ? (
          <>
            <select
              className="w-full h-7 text-xs rounded border bg-background px-2"
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              disabled={transcribing}
            >
              <option value="">Select audio/video...</option>
              {transcribableAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.filename}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={handleTranscribe}
              disabled={!selectedAssetId || transcribing}
            >
              {transcribing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Wand2 className="w-3 h-3 mr-1" />
              )}
              {transcribing ? "Transcribing..." : "Auto-Transcribe"}
            </Button>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Upload an audio or video file first
          </p>
        )}
        {error && (
          <p className="text-[10px] text-destructive">{error}</p>
        )}
      </div>

      {/* Subtitle list */}
      <div className="flex-1 overflow-y-auto">
        {allSubtitleClips.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No subtitles yet. Add manually or auto-transcribe from audio.
          </div>
        ) : (
          <div className="divide-y">
            {allSubtitleClips.map(({ track, clip }) => (
              <div key={clip.id} className="p-2 space-y-1 hover:bg-muted/50">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span>{formatTime(clip.start_time)}</span>
                  <span>→</span>
                  <span>{formatTime(clip.start_time + clip.duration)}</span>
                  <div className="flex-1" />
                  <button
                    onClick={() => removeClip(track.id, clip.id)}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Delete subtitle"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <textarea
                  className="w-full text-xs rounded border bg-background px-2 py-1 resize-none h-10"
                  value={clip.properties.subtitle_text || ""}
                  onChange={(e) =>
                    updateClip(track.id, clip.id, {
                      properties: {
                        ...clip.properties,
                        subtitle_text: e.target.value,
                      },
                    })
                  }
                />
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <span className="text-[9px] text-muted-foreground">Start</span>
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      className="h-6 text-[10px]"
                      value={clip.start_time}
                      onChange={(e) =>
                        updateClip(track.id, clip.id, {
                          start_time: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-muted-foreground">Duration</span>
                    <Input
                      type="number"
                      step={0.1}
                      min={0.1}
                      className="h-6 text-[10px]"
                      value={clip.duration}
                      onChange={(e) =>
                        updateClip(track.id, clip.id, {
                          duration: parseFloat(e.target.value) || 0.1,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add button */}
      <div className="p-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={addSubtitleClip}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Subtitle
        </Button>
      </div>
    </div>
  );
}
