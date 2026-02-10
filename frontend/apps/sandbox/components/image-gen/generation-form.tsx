"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workstation/ui";
import { AlertCircle, Info, Loader2, RotateCcw, Save, Wand2 } from "lucide-react";
import type { UseImageGenerationReturn } from "@workstation/api/hooks";
import type {
  ImageGenerationRequest,
  UserPreferences,
  WorkflowType,
} from "@workstation/api/types";

interface GenerationFormProps {
  projectId: string;
  hookState: UseImageGenerationReturn;
  userPreferences?: UserPreferences | null;
  onSaveAsDefault?: (defaults: Partial<UserPreferences>) => void;
}

interface FormState {
  workflow_type: WorkflowType;
  prompt: string;
  negative_prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  input_image: string;
  denoise: number;
}

const STORAGE_KEY_PREFIX = "image-gen-form:";
const MAX_UPLOAD_MB = 5;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const DEFAULT_FORM: FormState = {
  workflow_type: "text-to-image",
  prompt: "",
  negative_prompt: "",
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7,
  input_image: "",
  denoise: 0.75,
};

export function GenerationForm({ projectId, hookState, userPreferences, onSaveAsDefault }: GenerationFormProps) {
  const prefsDefaults = useMemo<Partial<FormState>>(() => {
    if (!userPreferences) return {};
    const d: Partial<FormState> = {};
    if (userPreferences.imggen_default_workflow) d.workflow_type = userPreferences.imggen_default_workflow as WorkflowType;
    if (userPreferences.imggen_default_width) d.width = userPreferences.imggen_default_width;
    if (userPreferences.imggen_default_height) d.height = userPreferences.imggen_default_height;
    if (userPreferences.imggen_default_steps) d.steps = userPreferences.imggen_default_steps;
    if (userPreferences.imggen_default_cfg_scale) d.cfg_scale = userPreferences.imggen_default_cfg_scale;
    if (userPreferences.imggen_default_negative_prompt) d.negative_prompt = userPreferences.imggen_default_negative_prompt;
    return d;
  }, [userPreferences]);

  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM, ...prefsDefaults });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const {
    generate,
    generating,
    error,
    currentGeneration,
    cancelGeneration,
  } = hookState;

  const storageKey = useMemo(
    () => `${STORAGE_KEY_PREFIX}${projectId}`,
    [projectId]
  );

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FormState>;
        setForm((prev) => ({ ...prev, ...parsed }));
        return;
      }
    } catch {
      // ignore storage parse failures
    }
    // No session storage — apply preferences defaults
    if (Object.keys(prefsDefaults).length > 0) {
      setForm((prev) => ({ ...prev, ...prefsDefaults }));
    }
  }, [storageKey, prefsDefaults]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(form));
  }, [form, storageKey]);

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    const prompt = form.prompt.trim();
    const negative = form.negative_prompt.trim();

    if (!prompt) nextErrors.prompt = "Prompt is required.";
    if (prompt.length > 2000) nextErrors.prompt = "Prompt must be <= 2000 chars.";
    if (negative.length > 2000) {
      nextErrors.negative_prompt = "Negative prompt must be <= 2000 chars.";
    }
    if (form.width < 64 || form.width > 2048) {
      nextErrors.width = "Width must be between 64 and 2048.";
    }
    if (form.height < 64 || form.height > 2048) {
      nextErrors.height = "Height must be between 64 and 2048.";
    }
    if (form.steps < 20 || form.steps > 50) {
      nextErrors.steps = "Steps must be between 20 and 50.";
    }
    if (form.cfg_scale < 1 || form.cfg_scale > 20) {
      nextErrors.cfg_scale = "CFG scale must be between 1 and 20.";
    }
    if (form.denoise < 0 || form.denoise > 1) {
      nextErrors.denoise = "Denoise must be between 0 and 1.";
    }
    if (form.workflow_type === "image-to-image" && !form.input_image.trim()) {
      nextErrors.input_image = "Input image is required for image-to-image.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;

    const payload: ImageGenerationRequest = {
      project_id: projectId,
      workflow_type: form.workflow_type,
      prompt: form.prompt.trim(),
      negative_prompt: form.negative_prompt.trim() || undefined,
      width: form.width,
      height: form.height,
      steps: form.steps,
      cfg_scale: form.cfg_scale,
      ...(form.workflow_type === "image-to-image"
        ? {
            input_image: form.input_image.trim(),
            denoise: form.denoise,
          }
        : {}),
    };

    await generate(payload);
  };

  const onReset = () => {
    setForm({ ...DEFAULT_FORM, ...prefsDefaults });
    setErrors({});
    setUploadError(null);
    setUploadedFileName(null);
    setImagePreview(null);
    setDragOver(false);
    sessionStorage.removeItem(storageKey);
  };

  const onUseDefaults = () => {
    setForm({ ...DEFAULT_FORM, ...prefsDefaults, prompt: form.prompt });
    sessionStorage.removeItem(storageKey);
  };

  const onSaveCurrentAsDefault = () => {
    if (!onSaveAsDefault) return;
    onSaveAsDefault({
      imggen_default_workflow: form.workflow_type,
      imggen_default_width: form.width,
      imggen_default_height: form.height,
      imggen_default_steps: form.steps,
      imggen_default_cfg_scale: form.cfg_scale,
      imggen_default_negative_prompt: form.negative_prompt || undefined,
    });
  };

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = (file: File) => {
    setUploadError(null);
    const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(`Image exceeds ${MAX_UPLOAD_MB}MB limit.`);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError("Only PNG, JPEG, and WEBP are allowed.");
      return;
    }

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setImagePreview(base64);
      setForm((prev) => ({ ...prev, input_image: base64 }));
    };
    reader.onerror = () => {
      setImagePreview(null);
      setForm((prev) => ({ ...prev, input_image: "" }));
      setUploadError("Failed to read image file. Please try again.");
      setUploadedFileName(null);
    };
    reader.readAsDataURL(file);
  };

  const onImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <p className="text-[11px] text-destructive mt-1">{errors[key]}</p>
    ) : null;

  return (
    <TooltipProvider>
      <form onSubmit={onSubmit} className="space-y-4 rounded-md border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Wand2 className="h-4 w-4" />
            Generate Image
          </h2>
          {currentGeneration && (
            <Badge variant="outline" className="text-[11px] capitalize">
              {currentGeneration.status}
            </Badge>
          )}
        </div>

        <Tabs
          value={form.workflow_type}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              workflow_type: value as WorkflowType,
            }))
          }
        >
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="text-to-image">Text to Image</TabsTrigger>
            <TabsTrigger value="image-to-image">Image to Image</TabsTrigger>
          </TabsList>
        </Tabs>

        <div>
          <label className="text-xs font-medium">Prompt</label>
          <textarea
            value={form.prompt}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, prompt: event.target.value }))
            }
            className="mt-1 min-h-[88px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Describe the image you want to generate..."
            maxLength={2000}
            required
          />
          <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
            <span>Required</span>
            <span>{form.prompt.length}/2000</span>
          </div>
          {fieldError("prompt")}
        </div>

        <div>
          <label className="text-xs font-medium">Negative Prompt</label>
          <textarea
            value={form.negative_prompt}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                negative_prompt: event.target.value,
              }))
            }
            className="mt-1 min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Optional: what to avoid in the generated image"
            maxLength={2000}
          />
          <div className="text-[11px] text-muted-foreground mt-1 text-right">
            {form.negative_prompt.length}/2000
          </div>
          {fieldError("negative_prompt")}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Presets:</span>
            {[512, 768, 1024].map((size) => (
              <Button
                key={size}
                type="button"
                variant={form.width === size && form.height === size ? "secondary" : "ghost"}
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={() => setForm((prev) => ({ ...prev, width: size, height: size }))}
              >
                {size}x{size}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium flex items-center gap-1">
                Width
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>Range: 64 to 2048 pixels.</TooltipContent>
                </Tooltip>
              </label>
              <Input
                type="number"
                min={64}
                max={2048}
                value={form.width}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    width: Number(event.target.value || 0),
                  }))
                }
                className="mt-1"
              />
              {fieldError("width")}
            </div>
            <div>
              <label className="text-xs font-medium flex items-center gap-1">
                Height
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>Range: 64 to 2048 pixels.</TooltipContent>
                </Tooltip>
              </label>
              <Input
                type="number"
                min={64}
                max={2048}
                value={form.height}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    height: Number(event.target.value || 0),
                  }))
                }
                className="mt-1"
              />
              {fieldError("height")}
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              Steps
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>More steps can improve quality but take longer. Range: 20 to 50.</TooltipContent>
              </Tooltip>
            </span>
            <span>{form.steps}</span>
          </label>
          <input
            type="range"
            min={20}
            max={50}
            value={form.steps}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, steps: Number(event.target.value) }))
            }
            className="mt-2 w-full"
          />
          {fieldError("steps")}
        </div>

        <div>
          <label className="text-xs font-medium flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              CFG Scale
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>Controls prompt adherence. Range: 1 to 20.</TooltipContent>
              </Tooltip>
            </span>
            <span>{form.cfg_scale.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={form.cfg_scale}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                cfg_scale: Number(event.target.value),
              }))
            }
            className="mt-2 w-full"
          />
          {fieldError("cfg_scale")}
        </div>

        {form.workflow_type === "image-to-image" && (
          <>
            <div>
              <label className="text-xs font-medium flex items-center gap-1">
                Input Image
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Upload max {MAX_UPLOAD_MB}MB (PNG/JPEG/WEBP). Image is sent as base64.
                  </TooltipContent>
                </Tooltip>
              </label>
              <div
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`mt-1 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                }`}
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="max-h-32 max-w-full rounded-md object-contain"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Drag & drop an image here, or click to browse
                  </p>
                )}
                <Input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  className="max-w-[200px] text-xs"
                  onChange={onImageUpload}
                />
              </div>
              {uploadedFileName && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Selected: {uploadedFileName}
                </p>
              )}
              {uploadError && (
                <p className="text-[11px] text-destructive mt-1">{uploadError}</p>
              )}
              {fieldError("input_image")}
            </div>

            <div>
              <label className="text-xs font-medium flex items-center justify-between gap-2">
                <span className="flex items-center gap-1">
                  Denoise
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      0 keeps original image, 1 regenerates heavily.
                    </TooltipContent>
                  </Tooltip>
                </span>
                <span>{form.denoise.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={form.denoise}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    denoise: Number(event.target.value),
                  }))
                }
                className="mt-2 w-full"
              />
              {fieldError("denoise")}
            </div>
          </>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={generating} className="flex-1">
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onReset} disabled={generating}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
          {generating && (
            <Button type="button" variant="ghost" onClick={cancelGeneration}>
              Stop Polling
            </Button>
          )}
        </div>

        {(userPreferences || onSaveAsDefault) && (
          <div className="flex items-center gap-2 pt-1 border-t">
            {userPreferences && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={onUseDefaults}
                disabled={generating}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Use defaults
              </Button>
            )}
            {onSaveAsDefault && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={onSaveCurrentAsDefault}
                disabled={generating}
              >
                <Save className="h-3 w-3 mr-1" />
                Save as default
              </Button>
            )}
          </div>
        )}
      </form>
    </TooltipProvider>
  );
}

