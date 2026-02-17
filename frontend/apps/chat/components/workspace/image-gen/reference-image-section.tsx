"use client";

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workstation/ui";
import { ChevronDown, X } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";
import { ImageUploadField } from "./image-upload-field";

interface ReferenceImageSectionProps {
  expanded: boolean;
  onToggle: () => void;
  referenceImage: string;
  referenceWeight: number;
  referenceNoise: number;
  preview: string | null;
  uploadName: string | null;
  error?: string | null;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onWeightChange: (value: number) => void;
  onNoiseChange: (value: number) => void;
  onPickFromGallery?: () => void;
}

export function ReferenceImageSection({
  expanded,
  onToggle,
  referenceImage,
  referenceWeight,
  referenceNoise,
  preview,
  uploadName,
  error,
  onDrop,
  onUpload,
  onClear,
  onWeightChange,
  onNoiseChange,
  onPickFromGallery,
}: ReferenceImageSectionProps) {
  return (
    <Collapsible open={expanded} onOpenChange={onToggle} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between p-3 text-xs font-medium hover:bg-muted/50"
        >
          <span className="flex items-center gap-1">
            Reference Image (Style Transfer){" "}
            <FieldHelp slug="imagegen-reference-image" tip="IPAdapter style transfer from reference" />
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 border-t p-3">
          <p className="text-[11px] text-muted-foreground">
            Upload a reference image for IPAdapter style transfer. The output will adopt the visual style and composition of the reference.
          </p>
          <ImageUploadField
            field="reference_image"
            label="Reference Image"
            description="Upload a style reference image (PNG/JPEG/WEBP)."
            preview={preview}
            uploadName={uploadName}
            error={error}
            onDrop={onDrop}
            onUpload={onUpload}
            onPickFromGallery={onPickFromGallery}
          />
          {referenceImage && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 text-[11px]"
              onClick={onClear}
            >
              <X className="h-3 w-3 mr-1" />
              Clear reference
            </Button>
          )}
          <div>
            <label className="text-xs font-medium flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                Style Weight{" "}
                <FieldHelp slug="imagegen-reference-weight" tip="How strongly the reference style influences the output (0-150%)" />
              </span>
              <span>{(referenceWeight * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={referenceWeight}
              onChange={(e) => onWeightChange(Number(e.target.value))}
              className="mt-1 w-full"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Higher = stronger style influence (0-150%)</p>
          </div>
          <div>
            <label className="text-xs font-medium flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                Variation/Noise{" "}
                <FieldHelp slug="imagegen-reference-noise" tip="Add variation to style transfer (0 = exact match, 100% = high variation)" />
              </span>
              <span>{(referenceNoise * 100).toFixed(0)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={referenceNoise}
              onChange={(e) => onNoiseChange(Number(e.target.value))}
              className="mt-1 w-full"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Add variation to the style transfer (0 = exact, 100% = high variation)</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
