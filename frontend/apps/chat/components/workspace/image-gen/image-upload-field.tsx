"use client";

import {
  Button,
  Input,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@workstation/ui";
import { ImageIcon, Info } from "lucide-react";

type UploadField = "input_image" | "mask_image" | "target_image" | "reference_image" | "controlnet_image";

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
  label,
  preview,
  uploadName,
  error,
  onDrop,
  onUpload,
  description,
  onPickFromGallery,
}: ImageUploadFieldProps) {
  return (
    <div>
      <label className="text-xs font-medium flex items-center gap-1">
        {label}
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
