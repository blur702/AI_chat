"use client";

import { FieldHelp } from "@/components/help/field-help";
import { ImageUploadField } from "./image-upload-field";
import { MaskEditor } from "./mask-editor";
import { ReferenceImageSection } from "./reference-image-section";
import { ControlNetSection } from "./controlnet-section";
import type { WorkflowType } from "@workstation/api/types";

interface ImagesTabContentProps {
  workflowType: WorkflowType;
  // Input image
  inputImagePreview: string | null;
  inputImageUploadName: string | null;
  inputImageError?: string;
  onInputImageDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onInputImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // Denoise
  denoise: number;
  onDenoiseChange: (value: number) => void;
  denoiseError?: string;
  // Mask editor (inpainting)
  maskImagePreview: string | null;
  maskImageUploadName: string | null;
  maskImageError?: string;
  onMaskChange: (dataUrl: string) => void;
  onMaskClear: () => void;
  onMaskImageDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onMaskImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // Face morph
  targetImagePreview: string | null;
  targetImageUploadName: string | null;
  targetImageError?: string;
  onTargetImageDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onTargetImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  morphStrength: number;
  onMorphStrengthChange: (value: number) => void;
  morphStrengthError?: string;
  // Reference image
  showReferenceImage: boolean;
  onToggleReferenceImage: () => void;
  referenceImage: string;
  referenceWeight: number;
  referenceNoise: number;
  referencePreview: string | null;
  referenceUploadName: string | null;
  referenceError?: string;
  onReferenceDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onReferenceUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReferenceClear: () => void;
  onReferenceWeightChange: (value: number) => void;
  onReferenceNoiseChange: (value: number) => void;
  // ControlNet
  showControlNet: boolean;
  onToggleControlNet: () => void;
  controlnetImage: string;
  controlnetType: string;
  controlnetStrength: number;
  controlnetTypes: string[];
  controlnetPreview: string | null;
  controlnetUploadName: string | null;
  controlnetError?: string;
  onControlnetDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onControlnetUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onControlnetClear: () => void;
  onControlnetTypeChange: (value: string) => void;
  onControlnetStrengthChange: (value: number) => void;
  // Gallery picker
  onPickFromGallery?: (field: string) => void;
}

const MAX_UPLOAD_MB = 10;

export function ImagesTabContent({
  workflowType,
  inputImagePreview,
  inputImageUploadName,
  inputImageError,
  onInputImageDrop,
  onInputImageUpload,
  denoise,
  onDenoiseChange,
  denoiseError,
  maskImagePreview,
  maskImageUploadName,
  maskImageError,
  onMaskChange,
  onMaskClear,
  onMaskImageDrop,
  onMaskImageUpload,
  targetImagePreview,
  targetImageUploadName,
  targetImageError,
  onTargetImageDrop,
  onTargetImageUpload,
  morphStrength,
  onMorphStrengthChange,
  morphStrengthError,
  showReferenceImage,
  onToggleReferenceImage,
  referenceImage,
  referenceWeight,
  referenceNoise,
  referencePreview,
  referenceUploadName,
  referenceError,
  onReferenceDrop,
  onReferenceUpload,
  onReferenceClear,
  onReferenceWeightChange,
  onReferenceNoiseChange,
  showControlNet,
  onToggleControlNet,
  controlnetImage,
  controlnetType,
  controlnetStrength,
  controlnetTypes,
  controlnetPreview,
  controlnetUploadName,
  controlnetError,
  onControlnetDrop,
  onControlnetUpload,
  onControlnetClear,
  onControlnetTypeChange,
  onControlnetStrengthChange,
  onPickFromGallery,
}: ImagesTabContentProps) {
  return (
    <div className="space-y-4">
      {/* Workflow-specific fields */}
      {workflowType !== "text-to-image" && (
        <>
          <ImageUploadField
            field="input_image"
            label="Input Image"
            description={`Upload max ${MAX_UPLOAD_MB}MB (PNG/JPEG/WEBP).`}
            preview={inputImagePreview}
            uploadName={inputImageUploadName}
            error={inputImageError}
            onDrop={onInputImageDrop}
            onUpload={onInputImageUpload}
            onPickFromGallery={onPickFromGallery ? () => onPickFromGallery("input_image") : undefined}
          />

          <div>
            <label className="text-xs font-medium flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                Denoise <FieldHelp slug="imagegen-denoise" tip="Controls how much the output deviates from the input image. 0.0 keeps the original nearly unchanged; 1.0 ignores the input entirely. Values around 0.5-0.7 work well for style transfer while preserving composition." />
              </span>
              <span>{denoise.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={denoise}
              onChange={(e) => onDenoiseChange(Number(e.target.value))}
              className="mt-2 w-full"
            />
            {denoiseError && <p className="text-[11px] text-destructive mt-1">{denoiseError}</p>}
          </div>

          {workflowType === "inpainting" && (
            <>
              <MaskEditor
                inputImagePreview={inputImagePreview}
                maskImagePreview={maskImagePreview}
                onMaskChange={onMaskChange}
                onMaskClear={onMaskClear}
              />
              <div className="pt-1 border-t">
                <ImageUploadField
                  field="mask_image"
                  label="Mask Image Upload (optional)"
                  description="Upload a pre-made mask instead of drawing. White areas are repainted; dark areas are preserved."
                  preview={maskImagePreview}
                  uploadName={maskImageUploadName}
                  error={maskImageError}
                  onDrop={onMaskImageDrop}
                  onUpload={onMaskImageUpload}
                  onPickFromGallery={onPickFromGallery ? () => onPickFromGallery("mask_image") : undefined}
                />
              </div>
            </>
          )}

          {workflowType === "face-morph" && (
            <>
              <ImageUploadField
                field="target_image"
                label="Target Face/Image"
                description="Image to morph toward."
                preview={targetImagePreview}
                uploadName={targetImageUploadName}
                error={targetImageError}
                onDrop={onTargetImageDrop}
                onUpload={onTargetImageUpload}
                onPickFromGallery={onPickFromGallery ? () => onPickFromGallery("target_image") : undefined}
              />
              <div>
                <label className="text-xs font-medium flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1">
                    Morph Strength <FieldHelp slug="imagegen-morph-strength" tip="Controls how strongly the target face features blend into the input image. Lower values produce subtle changes; higher values create a stronger morph toward the target." />
                  </span>
                  <span>{morphStrength.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={morphStrength}
                  onChange={(e) => onMorphStrengthChange(Number(e.target.value))}
                  className="mt-2 w-full"
                />
                {morphStrengthError && <p className="text-[11px] text-destructive mt-1">{morphStrengthError}</p>}
              </div>
            </>
          )}
        </>
      )}

      {workflowType === "text-to-image" && (
        <p className="text-xs text-muted-foreground">
          Switch to Img2Img, Inpaint, or Face Morph workflow to upload input images.
        </p>
      )}

      {/* Reference Image (IPAdapter Style Transfer) */}
      <ReferenceImageSection
        expanded={showReferenceImage}
        onToggle={onToggleReferenceImage}
        referenceImage={referenceImage}
        referenceWeight={referenceWeight}
        referenceNoise={referenceNoise}
        preview={referencePreview}
        uploadName={referenceUploadName}
        error={referenceError}
        onDrop={onReferenceDrop}
        onUpload={onReferenceUpload}
        onClear={onReferenceClear}
        onWeightChange={onReferenceWeightChange}
        onNoiseChange={onReferenceNoiseChange}
        onPickFromGallery={onPickFromGallery ? () => onPickFromGallery("reference_image") : undefined}
      />

      {/* ControlNet */}
      <ControlNetSection
        expanded={showControlNet}
        onToggle={onToggleControlNet}
        controlnetImage={controlnetImage}
        controlnetType={controlnetType}
        controlnetStrength={controlnetStrength}
        controlnetTypes={controlnetTypes}
        preview={controlnetPreview}
        uploadName={controlnetUploadName}
        error={controlnetError}
        onDrop={onControlnetDrop}
        onUpload={onControlnetUpload}
        onClear={onControlnetClear}
        onTypeChange={onControlnetTypeChange}
        onStrengthChange={onControlnetStrengthChange}
        onPickFromGallery={onPickFromGallery ? () => onPickFromGallery("controlnet_image") : undefined}
      />
    </div>
  );
}
