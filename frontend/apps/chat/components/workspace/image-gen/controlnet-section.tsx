"use client";

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workstation/ui";
import { ChevronDown, X } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";
import { ImageUploadField } from "./image-upload-field";

interface ControlNetSectionProps {
  expanded: boolean;
  onToggle: () => void;
  controlnetImage: string;
  controlnetType: string;
  controlnetStrength: number;
  controlnetTypes: string[];
  preview: string | null;
  uploadName: string | null;
  error?: string | null;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onTypeChange: (value: string) => void;
  onStrengthChange: (value: number) => void;
  onPickFromGallery?: () => void;
}

export function ControlNetSection({
  expanded,
  onToggle,
  controlnetImage,
  controlnetType,
  controlnetStrength,
  controlnetTypes,
  preview,
  uploadName,
  error,
  onDrop,
  onUpload,
  onClear,
  onTypeChange,
  onStrengthChange,
  onPickFromGallery,
}: ControlNetSectionProps) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between p-3 text-xs font-medium hover:bg-muted/50"
        >
          <span className="flex items-center gap-1">
            ControlNet (Structure Guide){" "}
            <FieldHelp slug="imagegen-controlnet" tip="Constrains output to match a guide image's structure. For example, upload a photo and use 'canny' to preserve its outlines while completely changing the style." />
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 border-t p-3">
          <p className="text-[11px] text-muted-foreground">
            Upload a guide image and select a ControlNet type. The output will follow the structure of the guide.
          </p>
          <div>
            <label htmlFor="controlnet-type-select" className="text-xs font-medium flex items-center gap-1">
              ControlNet Type{" "}
              <FieldHelp slug="imagegen-controlnet-type" tip="Preprocessing method for the guide image. For example, 'canny' extracts edges for shape control, 'depth' preserves spatial layout, 'openpose' detects body positions." />
            </label>
            <select
              id="controlnet-type-select"
              value={controlnetType}
              onChange={(e) => onTypeChange(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Select type...</option>
              {controlnetTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <ImageUploadField
            field="controlnet_image"
            label="ControlNet Image"
            description="Upload a structure guide image (edges, depth map, pose, etc.)."
            preview={preview}
            uploadName={uploadName}
            error={error}
            onDrop={onDrop}
            onUpload={onUpload}
            onPickFromGallery={onPickFromGallery}
          />
          {controlnetImage && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 text-[11px]"
              onClick={onClear}
            >
              <X className="h-3 w-3 mr-1" />
              Clear ControlNet
            </Button>
          )}
          <div>
            <label className="text-xs font-medium flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                Strength{" "}
                <FieldHelp slug="imagegen-controlnet-strength" tip="How closely output follows the guide. For example, 0.8 preserves structure while allowing creative fills, 1.5 strictly follows every edge. Start at 0.8-1.0." />
              </span>
              <span>{controlnetStrength.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={controlnetStrength}
              onChange={(e) => onStrengthChange(Number(e.target.value))}
              className="mt-1 w-full"
            />
            <p className="text-[11px] text-muted-foreground mt-1">How closely to follow the structure guide (0-2)</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
