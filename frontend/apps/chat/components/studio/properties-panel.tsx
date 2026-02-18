"use client";

import { useCallback } from "react";
import { Input } from "@workstation/ui";

function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { className?: string }) {
  return <label className={`text-xs font-medium ${className || ""}`} {...props}>{children}</label>;
}
import { useStudioStore } from "./use-studio-store";

export function PropertiesPanel() {
  const { selectedClipId, selectedTrackId, timeline, updateClip } =
    useStudioStore();

  // Find selected clip
  let selectedTrack = timeline.tracks.find((t) => t.id === selectedTrackId);
  let selectedClip = selectedTrack?.clips.find((c) => c.id === selectedClipId);

  // If not found by track, search all tracks
  if (!selectedClip && selectedClipId) {
    for (const track of timeline.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) {
        selectedClip = clip;
        selectedTrack = track;
        break;
      }
    }
  }

  const handleUpdate = useCallback(
    (field: string, value: any) => {
      if (!selectedTrack || !selectedClip) return;
      if (field.startsWith("properties.")) {
        const propKey = field.slice("properties.".length);
        updateClip(selectedTrack.id, selectedClip.id, {
          properties: { ...selectedClip.properties, [propKey]: value },
        });
      } else {
        updateClip(selectedTrack.id, selectedClip.id, { [field]: value });
      }
    },
    [selectedTrack, selectedClip, updateClip]
  );

  if (!selectedClip || !selectedTrack) {
    return (
      <div className="h-full flex flex-col border-l bg-card">
        <div className="p-3 border-b">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Properties
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
          Select a clip on the timeline to edit its properties
        </div>
      </div>
    );
  }

  const props = selectedClip.properties;

  return (
    <div className="h-full flex flex-col border-l bg-card overflow-y-auto">
      <div className="p-3 border-b">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Properties
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {selectedClip.type} clip
        </p>
      </div>

      <div className="p-3 space-y-4">
        {/* Timing */}
        <div>
          <h4 className="text-xs font-semibold mb-2">Timing</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Start (s)</Label>
              <Input
                type="number"
                step={0.1}
                min={0}
                className="h-7 text-xs"
                value={selectedClip.start_time}
                onChange={(e) =>
                  handleUpdate("start_time", parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div>
              <Label className="text-[10px]">Duration (s)</Label>
              <Input
                type="number"
                step={0.1}
                min={0.1}
                className="h-7 text-xs"
                value={selectedClip.duration}
                onChange={(e) =>
                  handleUpdate("duration", parseFloat(e.target.value) || 0.1)
                }
              />
            </div>
          </div>
        </div>

        {/* Opacity (video, image) */}
        {(selectedClip.type === "video" || selectedClip.type === "image") && (
          <div>
            <Label className="text-[10px]">
              Opacity: {Math.round((props.opacity ?? 1) * 100)}%
            </Label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={props.opacity ?? 1}
              onChange={(e) =>
                handleUpdate("properties.opacity", parseFloat(e.target.value))
              }
              className="w-full h-1 accent-primary"
            />
          </div>
        )}

        {/* Volume (video, audio) */}
        {(selectedClip.type === "video" || selectedClip.type === "audio") && (
          <div>
            <Label className="text-[10px]">
              Volume: {Math.round((props.volume ?? 1) * 100)}%
            </Label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={props.volume ?? 1}
              onChange={(e) =>
                handleUpdate("properties.volume", parseFloat(e.target.value))
              }
              className="w-full h-1 accent-primary"
            />
          </div>
        )}

        {/* Position */}
        {(selectedClip.type === "video" ||
          selectedClip.type === "image" ||
          selectedClip.type === "text") && (
          <div>
            <h4 className="text-xs font-semibold mb-2">Position</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">X (0-1)</Label>
                <Input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className="h-7 text-xs"
                  value={props.position?.x ?? 0}
                  onChange={(e) =>
                    handleUpdate("properties.position", {
                      ...props.position,
                      x: parseFloat(e.target.value) || 0,
                      y: props.position?.y ?? 0,
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-[10px]">Y (0-1)</Label>
                <Input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className="h-7 text-xs"
                  value={props.position?.y ?? 0}
                  onChange={(e) =>
                    handleUpdate("properties.position", {
                      x: props.position?.x ?? 0,
                      y: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Text properties */}
        {selectedClip.type === "text" && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold">Text</h4>
            <div>
              <Label className="text-[10px]">Content</Label>
              <textarea
                className="w-full h-20 text-xs rounded border bg-background px-2 py-1 resize-none"
                value={props.text || ""}
                onChange={(e) =>
                  handleUpdate("properties.text", e.target.value)
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Font Size</Label>
                <Input
                  type="number"
                  min={8}
                  max={200}
                  className="h-7 text-xs"
                  value={props.font_size || 48}
                  onChange={(e) =>
                    handleUpdate(
                      "properties.font_size",
                      parseInt(e.target.value) || 48
                    )
                  }
                />
              </div>
              <div>
                <Label className="text-[10px]">Color</Label>
                <input
                  type="color"
                  className="w-full h-7 rounded border cursor-pointer"
                  value={props.color || "#FFFFFF"}
                  onChange={(e) =>
                    handleUpdate("properties.color", e.target.value)
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Font Family</Label>
              <Input
                className="h-7 text-xs"
                value={props.font_family || "Inter"}
                onChange={(e) =>
                  handleUpdate("properties.font_family", e.target.value)
                }
              />
            </div>
          </div>
        )}

        {/* Subtitle properties */}
        {selectedClip.type === "subtitle" && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold">Subtitle</h4>
            <div>
              <Label className="text-[10px]">Text</Label>
              <textarea
                className="w-full h-16 text-xs rounded border bg-background px-2 py-1 resize-none"
                value={props.subtitle_text || ""}
                onChange={(e) =>
                  handleUpdate("properties.subtitle_text", e.target.value)
                }
                placeholder="Subtitle text..."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Font Size</Label>
                <Input
                  type="number"
                  min={12}
                  max={72}
                  className="h-7 text-xs"
                  value={props.font_size || 24}
                  onChange={(e) =>
                    handleUpdate(
                      "properties.font_size",
                      parseInt(e.target.value) || 24
                    )
                  }
                />
              </div>
              <div>
                <Label className="text-[10px]">Color</Label>
                <input
                  type="color"
                  className="w-full h-7 rounded border cursor-pointer"
                  value={props.color || "#FFFFFF"}
                  onChange={(e) =>
                    handleUpdate("properties.color", e.target.value)
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Position</Label>
              <select
                className="w-full h-7 text-xs rounded border bg-background px-2"
                value={props.subtitle_style || "bottom-center"}
                onChange={(e) =>
                  handleUpdate("properties.subtitle_style", e.target.value)
                }
              >
                <option value="bottom-center">Bottom Center</option>
                <option value="top-center">Top Center</option>
                <option value="custom">Custom Position</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px]">
                Background: {Math.round((props.background_opacity ?? 0.5) * 100)}%
              </Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={props.background_opacity ?? 0.5}
                onChange={(e) =>
                  handleUpdate("properties.background_opacity", parseFloat(e.target.value))
                }
                className="w-full h-1 accent-primary"
              />
            </div>
          </div>
        )}

        {/* Link / URL (available on all visual clip types) */}
        {(selectedClip.type === "text" ||
          selectedClip.type === "image" ||
          selectedClip.type === "video" ||
          selectedClip.type === "subtitle") && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold">Link (HTML Export)</h4>
            <div>
              <Label className="text-[10px]">URL</Label>
              <Input
                className="h-7 text-xs"
                placeholder="https://..."
                value={props.url || ""}
                onChange={(e) =>
                  handleUpdate("properties.url", e.target.value)
                }
              />
            </div>
            <div>
              <Label className="text-[10px]">Link Label</Label>
              <Input
                className="h-7 text-xs"
                placeholder="Click here"
                value={props.link_label || ""}
                onChange={(e) =>
                  handleUpdate("properties.link_label", e.target.value)
                }
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Links are clickable in Interactive HTML export only
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
