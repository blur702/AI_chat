"use client";

import {
  Button,
  Input,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@workstation/ui";
import { ImageIcon, Info } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

type UploadField = "input_image" | "mask_image" | "target_image" | "reference_image" | "controlnet_image";

const FIELD_HELP: Record<UploadField, { slug: string; tip: string }> = {
  input_image: {
    slug: "imagegen-workflow",
    tip: "Base image used for image-to-image and inpainting workflows.",
  },
  mask_image: {
    slug: "imagegen-mask-editor",
    tip: "Mask image where white areas are regenerated and black areas are preserved.",
  },
  target_image: {
    slug: "imagegen-morph-strength",
    tip: "Second source image used by blend or morph workflows.",
  },
  reference_image: {
    slug: "imagegen-reference-image",
    tip: "Reference image that guides style and composition.",
  },
  controlnet_image: {
    slug: "imagegen-controlnet",
    tip: "Conditioning image used by ControlNet for structure guidance.",
  },
};

interface ImageUploadFieldProps {
  field: UploadField;
  label: string;
  description: string;
  preview: string | null;
  uploadName: string | null;
  error?: string | null;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPickFromGallery?: () => void;
}

export function ImageUploadField({
  field,
  label,
  preview,
  uploadName,
  error,
  onDrop,
  onUpload,
  description,
  onPickFromGallery,
}: ImageUploadFieldProps) {
  const help = FIELD_HELP[field];

  return (
    <div>
      <label className="text-xs font-medium flex items-center gap-1">
        {label}
        <FieldHelp slug={help.slug} tip={help.tip} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent>{description}</TooltipContent>
        </Tooltip>
      </label>
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="mt-1 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center border-muted-foreground/25"
      >
        {preview ? (
          <img
            src={preview}
            alt={`${label} preview`}
            className="max-h-32 max-w-full rounded-md object-contain"
          />
        ) : (
          <p className="text-xs text-muted-foreground">Drag & drop an image here, or click to browse</p>
        )}
        <Input
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          className="max-w-[220px] text-xs"
          onChange={onUpload}
          aria-label={`Upload ${label}`}
        />
        {onPickFromGallery && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1"
            onClick={onPickFromGallery}
          >
            <ImageIcon className="h-3 w-3" />
            Pick from Gallery
          </Button>
        )}
      </div>
      {uploadName && (
        <p className="mt-1 text-[11px] text-muted-foreground">Selected: {uploadName}</p>
      )}
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </div>
  );
}
