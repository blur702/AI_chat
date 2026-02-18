import type { TimelineData, TimelineClip, TimelineTrack } from "./use-studio-store";

/**
 * PlaybackEngine synchronizes HTML <video>, <audio>, <img>, and <div> elements
 * against a timeline using requestAnimationFrame.
 *
 * It renders clips as layered DOM elements inside a container div.
 */
export class PlaybackEngine {
  private container: HTMLDivElement;
  private onTimeUpdate: () => void;
  private timeline: TimelineData | null = null;
  private playing = false;
  private currentTime = 0;
  private startWallTime = 0;
  private rafId: number | null = null;
  private elements = new Map<string, HTMLElement>();
  private blobUrls = new Map<string, string>();
  constructor(container: HTMLDivElement, onTimeUpdate: () => void) {
    this.container = container;
    this.onTimeUpdate = onTimeUpdate;
  }

  setTimeline(timeline: TimelineData) {
    this.timeline = timeline;
    this.rebuildElements();
    this.renderFrame();
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.startWallTime = performance.now() - this.currentTime * 1000;
    this.tick();

    // Play all video/audio elements that should be active
    this.elements.forEach((el) => {
      if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
        el.play().catch(() => {});
      }
    });
  }

  pause() {
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.elements.forEach((el) => {
      if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
        el.pause();
      }
    });
  }

  seek(time: number) {
    this.currentTime = Math.max(0, time);
    this.startWallTime = performance.now() - this.currentTime * 1000;
    this.syncMediaElements();
    this.renderFrame();
    this.onTimeUpdate();
  }

  destroy() {
    this.pause();
    this.elements.forEach((el) => el.remove());
    this.elements.clear();
    // Revoke all blob URLs to free memory
    this.blobUrls.forEach((url) => URL.revokeObjectURL(url));
    this.blobUrls.clear();
  }

  // -------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------

  private tick = () => {
    if (!this.playing) return;

    const now = performance.now();
    this.currentTime = (now - this.startWallTime) / 1000;

    // Compute total duration
    const totalDuration = this.computeDuration();
    if (this.currentTime >= totalDuration) {
      this.currentTime = totalDuration;
      this.playing = false;
      this.onTimeUpdate();
      this.renderFrame();
      return;
    }

    this.renderFrame();
    this.onTimeUpdate();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private computeDuration(): number {
    if (!this.timeline) return 0;
    let max = 0;
    for (const track of this.timeline.tracks) {
      for (const clip of track.clips) {
        max = Math.max(max, clip.start_time + clip.duration);
      }
    }
    return max;
  }

  /** Fetch a media file with auth and return a blob URL. */
  private async fetchMediaBlobUrl(assetId: string): Promise<string> {
    const cached = this.blobUrls.get(assetId);
    if (cached) return cached;

    const res = await fetch(`/api/studio/media/${assetId}/file`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Failed to fetch media ${assetId}: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    this.blobUrls.set(assetId, url);
    return url;
  }

  private rebuildElements() {
    // Remove old elements
    this.elements.forEach((el) => el.remove());
    this.elements.clear();

    if (!this.timeline) return;

    for (const track of this.timeline.tracks) {
      if (!track.visible) continue;

      for (const clip of track.clips) {
        const el = this.createElementForClip(clip, track);
        if (el) {
          el.style.position = "absolute";
          el.style.display = "none";
          el.dataset.clipId = clip.id;
          this.container.appendChild(el);
          this.elements.set(clip.id, el);
        }
      }
    }
  }

  private createElementForClip(clip: TimelineClip, track: TimelineTrack): HTMLElement | null {
    const type = clip.type || track.type;

    if (type === "video" && clip.media_asset_id) {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = track.muted;
      video.playsInline = true;
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = "contain";
      const props = clip.properties;
      video.style.opacity = String(props.opacity ?? 1);
      if (props.volume !== undefined) video.volume = props.volume;
      // Load via authenticated fetch
      this.fetchMediaBlobUrl(clip.media_asset_id).then((url) => {
        video.src = url;
      }).catch(() => {});
      return video;
    }

    if (type === "audio" && clip.media_asset_id) {
      const audio = document.createElement("audio");
      audio.preload = "auto";
      audio.muted = track.muted;
      const props = clip.properties;
      if (props.volume !== undefined) audio.volume = props.volume;
      this.fetchMediaBlobUrl(clip.media_asset_id).then((url) => {
        audio.src = url;
      }).catch(() => {});
      return audio;
    }

    if (type === "text") {
      const div = document.createElement("div");
      const props = clip.properties;
      div.textContent = props.text || "";
      div.style.fontFamily = props.font_family || "Inter, sans-serif";
      div.style.fontSize = `${props.font_size || 48}px`;
      div.style.color = props.color || "#FFFFFF";
      div.style.textAlign = "center";
      div.style.whiteSpace = "pre-wrap";
      div.style.pointerEvents = "none";
      div.style.textShadow = "0 2px 4px rgba(0,0,0,0.5)";
      // Position: x,y as fractions of container
      const pos = props.position || { x: 0.5, y: 0.5 };
      div.style.left = `${pos.x * 100}%`;
      div.style.top = `${pos.y * 100}%`;
      div.style.transform = "translate(-50%, -50%)";
      return div;
    }

    if (type === "image" && clip.media_asset_id) {
      const img = document.createElement("img");
      img.style.objectFit = "contain";
      img.draggable = false;
      const props = clip.properties;
      img.style.opacity = String(props.opacity ?? 1);
      const pos = props.position || { x: 0, y: 0 };
      img.style.left = `${pos.x * 100}%`;
      img.style.top = `${pos.y * 100}%`;
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      this.fetchMediaBlobUrl(clip.media_asset_id).then((url) => {
        img.src = url;
      }).catch(() => {});
      return img;
    }

    if (type === "subtitle") {
      const wrapper = document.createElement("div");
      const props = clip.properties;
      const style = props.subtitle_style || "bottom-center";

      wrapper.style.width = "100%";
      wrapper.style.display = "flex";
      wrapper.style.justifyContent = "center";
      wrapper.style.pointerEvents = "none";

      if (style === "bottom-center") {
        wrapper.style.bottom = "8%";
        wrapper.style.left = "0";
      } else if (style === "top-center") {
        wrapper.style.top = "8%";
        wrapper.style.left = "0";
      } else {
        const pos = props.position || { x: 0.5, y: 0.9 };
        wrapper.style.left = `${pos.x * 100}%`;
        wrapper.style.top = `${pos.y * 100}%`;
        wrapper.style.transform = "translate(-50%, -50%)";
        wrapper.style.width = "auto";
      }

      const span = document.createElement("span");
      span.textContent = props.subtitle_text || "";
      span.style.fontFamily = props.font_family || "Inter, sans-serif";
      span.style.fontSize = `${props.font_size || 24}px`;
      span.style.color = props.color || "#FFFFFF";
      span.style.padding = "4px 12px";
      span.style.borderRadius = "4px";
      const bgOpacity = props.background_opacity ?? 0.5;
      span.style.backgroundColor = `rgba(0,0,0,${bgOpacity})`;

      wrapper.appendChild(span);
      return wrapper;
    }

    return null;
  }

  private renderFrame() {
    if (!this.timeline) return;

    const t = this.currentTime;

    for (const track of this.timeline.tracks) {
      if (!track.visible) continue;

      for (const clip of track.clips) {
        const el = this.elements.get(clip.id);
        if (!el) continue;

        const clipStart = clip.start_time;
        const clipEnd = clipStart + clip.duration;
        const isActive = t >= clipStart && t < clipEnd;

        el.style.display = isActive ? "" : "none";
      }
    }
  }

  private syncMediaElements() {
    if (!this.timeline) return;
    const t = this.currentTime;

    for (const track of this.timeline.tracks) {
      for (const clip of track.clips) {
        const el = this.elements.get(clip.id);
        if (!el) continue;

        if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
          const clipOffset = t - clip.start_time;
          const trimStart = clip.trim_start || 0;
          el.currentTime = Math.max(0, trimStart + clipOffset);
        }
      }
    }
  }
}
