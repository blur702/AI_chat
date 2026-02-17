"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipProvider,
} from "@workstation/ui";
import { AlertCircle, AlertTriangle, Loader2, RotateCcw, Save, Wand2 } from "lucide-react";
import { PromptTabContent } from "./prompt-tab-content";
import { ModelTabContent } from "./model-tab-content";
import { SettingsTabContent } from "./settings-tab-content";
import { ImagesTabContent } from "./images-tab-content";
import { GalleryPickerDialog } from "./gallery-picker-dialog";
import { useImageUpload } from "@/hooks/use-image-upload";
import { useFormPersistence } from "@/hooks/use-form-persistence";
import type { UseImageGenerationReturn } from "@workstation/api/hooks";
import type {
  ImageGenerationOptionsResponse,
  ImageGenerationRequest,
  LoraConfig,
  PromptPresetResponse,
  UserPreferences,
  WorkflowType,
} from "@workstation/api/types";

interface GenerationFormProps {
  projectId: string;
  hookState: UseImageGenerationReturn;
  userPreferences?: UserPreferences | null;
  projectSystemContext?: string;
  onSaveProjectSystemContext?: (value: string) => Promise<boolean>;
  onSaveAsDefault?: (defaults: Partial<UserPreferences>) => void;
  comfyuiAvailable?: boolean;
  comfyuiStarting?: boolean;
  comfyuiStatusMessage?: string | null;
  comfyuiStartupSeconds?: number;
  onStartComfyui?: () => Promise<void>;
  imageOptions?: ImageGenerationOptionsResponse | null;
  optionsLoading?: boolean;
}

interface FormState {
  [key: string]: unknown;
  workflow_type: WorkflowType;
  prompt: string;
  negative_prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  input_image: string;
  mask_image: string;
  target_image: string;
  denoise: number;
  morph_strength: number;
  seed: string;
  sampler_name: string;
  scheduler: string;
  batch_size: number;
  model_name: string;
  loras: LoraConfig[];
  reference_image: string;
  reference_weight: number;
  reference_noise: number;
  controlnet_image: string;
  controlnet_type: string;
  controlnet_strength: number;
}

type UploadField = "input_image" | "mask_image" | "target_image" | "reference_image" | "controlnet_image";

type FormTab = "prompt" | "model" | "settings" | "images";

const DEFAULT_FORM: FormState = {
  workflow_type: "text-to-image",
  prompt: "",
  negative_prompt: "",
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7,
  input_image: "",
  mask_image: "",
  target_image: "",
  denoise: 0.75,
  morph_strength: 0.5,
  seed: "",
  sampler_name: "euler",
  scheduler: "normal",
  batch_size: 1,
  model_name: "",
  loras: [],
  reference_image: "",
  reference_weight: 0.7,
  reference_noise: 0.0,
  controlnet_image: "",
  controlnet_type: "",
  controlnet_strength: 1.0,
};

// Maps error keys to the tab they belong to
const ERROR_TAB_MAP: Record<string, FormTab> = {
  prompt: "prompt",
  negative_prompt: "prompt",
  width: "settings",
  height: "settings",
  steps: "settings",
  cfg_scale: "settings",
  batch_size: "settings",
  input_image: "images",
  mask_image: "images",
  target_image: "images",
  denoise: "images",
  morph_strength: "images",
  loras: "model",
};

function defaultLora(loras: string[]): LoraConfig {
  return { name: loras[0] ?? "", strength_model: 1, strength_clip: 1 };
}

function tabsWithErrors(errors: Record<string, string>): Set<FormTab> {
  const tabs = new Set<FormTab>();
  for (const key of Object.keys(errors)) {
    const tab = ERROR_TAB_MAP[key];
    if (tab) tabs.add(tab);
  }
  return tabs;
}

function firstTabWithError(errors: Record<string, string>): FormTab | null {
  const order: FormTab[] = ["prompt", "model", "settings", "images"];
  const errorTabs = tabsWithErrors(errors);
  return order.find((t) => errorTabs.has(t)) ?? null;
}

export function GenerationForm({
  projectId,
  hookState,
  userPreferences,
  projectSystemContext,
  onSaveProjectSystemContext,
  onSaveAsDefault,
  comfyuiAvailable,
  comfyuiStarting = false,
  comfyuiStatusMessage = null,
  comfyuiStartupSeconds = 0,
  onStartComfyui,
  imageOptions,
  optionsLoading = false,
}: GenerationFormProps) {
  const comfyuiBadgeLabel = comfyuiAvailable
    ? "comfyui ready"
    : comfyuiStarting
      ? "starting comfyui"
      : comfyuiAvailable === false
        ? "comfyui unavailable"
        : "checking comfyui";

  const models = imageOptions?.models ?? [];
  const loraOptions = imageOptions?.loras ?? [];
  const samplerOptions = imageOptions?.samplers ?? ["euler"];
  const schedulerOptions = imageOptions?.schedulers ?? ["normal"];

  const prefsDefaults = useMemo<Partial<FormState>>(() => {
    if (!userPreferences) return {};
    const d: Partial<FormState> = {};
    if (userPreferences.imggen_default_workflow) d.workflow_type = userPreferences.imggen_default_workflow as WorkflowType;
    if (userPreferences.imggen_default_width) d.width = userPreferences.imggen_default_width;
    if (userPreferences.imggen_default_height) d.height = userPreferences.imggen_default_height;
    if (userPreferences.imggen_default_steps) d.steps = userPreferences.imggen_default_steps;
    if (userPreferences.imggen_default_cfg_scale) d.cfg_scale = userPreferences.imggen_default_cfg_scale;
    if (userPreferences.imggen_default_prompt) d.prompt = userPreferences.imggen_default_prompt;
    if (userPreferences.imggen_default_negative_prompt) d.negative_prompt = userPreferences.imggen_default_negative_prompt;
    return d;
  }, [userPreferences]);

  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM, ...prefsDefaults });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formTab, setFormTab] = useState<FormTab>("prompt");
  const [showReferenceImage, setShowReferenceImage] = useState(() => !!form.reference_image);
  const [showControlNet, setShowControlNet] = useState(() => !!form.controlnet_image);
  const [projectSystemContextInput, setProjectSystemContextInput] = useState(projectSystemContext ?? "");
  const [projectSystemContextSaving, setProjectSystemContextSaving] = useState(false);
  const [projectSystemContextMsg, setProjectSystemContextMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const upload = useImageUpload();
  const { clear: clearStorage } = useFormPersistence(projectId, form, setForm, prefsDefaults);

  const { generate, generating, error, currentGeneration, cancelGeneration, generations } = hookState;
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const galleryPickerFieldRef = useRef<UploadField>("input_image");

  const errorTabSet = useMemo(() => tabsWithErrors(errors), [errors]);

  // Auto-select first model/sampler/scheduler from options
  useEffect(() => {
    setForm((prev) => {
      let changed = false;
      let next = prev;
      if (!prev.model_name && models.length > 0) { next = { ...next, model_name: models[0] }; changed = true; }
      if (!prev.sampler_name && samplerOptions.length > 0) { next = { ...next, sampler_name: samplerOptions[0] }; changed = true; }
      if (!prev.scheduler && schedulerOptions.length > 0) { next = { ...next, scheduler: schedulerOptions[0] }; changed = true; }
      return changed ? next : prev;
    });
  }, [models, samplerOptions, schedulerOptions]);

  useEffect(() => {
    setProjectSystemContextInput(projectSystemContext ?? "");
  }, [projectSystemContext]);

  const handleFormUpload = useCallback((field: UploadField, base64: string) => {
    if (field === "input_image") {
      setForm((prev) => ({ ...prev, input_image: base64, mask_image: "" }));
    } else {
      setForm((prev) => ({ ...prev, [field]: base64 }));
    }
  }, []);

  const openGalleryPicker = useCallback((field: string) => {
    galleryPickerFieldRef.current = field as UploadField;
    setGalleryPickerOpen(true);
  }, []);

  const handleGallerySelect = useCallback((base64: string, filename: string) => {
    const field = galleryPickerFieldRef.current;
    handleFormUpload(field, base64);
    upload.setPreviews((prev) => ({ ...prev, [field]: base64 }));
    upload.setUploadNames((prev) => ({ ...prev, [field]: filename }));
  }, [handleFormUpload, upload]);

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    const prompt = form.prompt.trim();
    const negative = form.negative_prompt.trim();

    if (!prompt) nextErrors.prompt = "Prompt is required.";
    if (prompt.length > 2000) nextErrors.prompt = "Prompt must be <= 2000 chars.";
    if (negative.length > 2000) nextErrors.negative_prompt = "Negative prompt must be <= 2000 chars.";
    if (form.width < 64 || form.width > 2048) nextErrors.width = "Width must be between 64 and 2048.";
    if (form.height < 64 || form.height > 2048) nextErrors.height = "Height must be between 64 and 2048.";
    if (form.steps < 1 || form.steps > 150) nextErrors.steps = "Steps must be between 1 and 150.";
    if (form.cfg_scale < 1 || form.cfg_scale > 30) nextErrors.cfg_scale = "CFG scale must be between 1 and 30.";
    if (form.denoise < 0 || form.denoise > 1) nextErrors.denoise = "Denoise must be between 0 and 1.";
    if (form.morph_strength < 0 || form.morph_strength > 1) nextErrors.morph_strength = "Morph strength must be between 0 and 1.";
    if (form.batch_size < 1 || form.batch_size > 8) nextErrors.batch_size = "Batch size must be between 1 and 8.";

    if (form.workflow_type !== "text-to-image" && !form.input_image.trim()) nextErrors.input_image = "Input image is required.";
    if (form.workflow_type === "inpainting" && !form.mask_image.trim()) nextErrors.mask_image = "Mask image is required for inpainting.";
    if (form.workflow_type === "face-morph" && !form.target_image.trim()) nextErrors.target_image = "Target image is required for face morph.";
    if (form.loras.some((l) => !l.name.trim())) nextErrors.loras = "Each LoRA entry needs a valid name.";

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstTab = firstTabWithError(nextErrors);
      if (firstTab) setFormTab(firstTab);
      return false;
    }
    return true;
  };

  const handlePresetSelect = (preset: PromptPresetResponse) => {
    setForm((prev) => ({
      ...prev,
      prompt: preset.prompt_text,
      negative_prompt: preset.negative_prompt_text || "",
      ...(preset.workflow_settings?.width ? { width: preset.workflow_settings.width as number } : {}),
      ...(preset.workflow_settings?.height ? { height: preset.workflow_settings.height as number } : {}),
      ...(preset.workflow_settings?.steps ? { steps: preset.workflow_settings.steps as number } : {}),
      ...(preset.workflow_settings?.cfg_scale ? { cfg_scale: preset.workflow_settings.cfg_scale as number } : {}),
      ...(preset.workflow_settings?.sampler_name ? { sampler_name: preset.workflow_settings.sampler_name as string } : {}),
      ...(preset.workflow_settings?.model_name ? { model_name: preset.workflow_settings.model_name as string } : {}),
    }));
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
      denoise: form.denoise,
      morph_strength: form.morph_strength,
      sampler_name: form.sampler_name,
      scheduler: form.scheduler,
      batch_size: form.batch_size,
      model_name: form.model_name || undefined,
      loras: form.loras,
      ...(form.seed.trim() ? { seed: Number(form.seed) } : {}),
      ...(form.workflow_type !== "text-to-image" ? { input_image: form.input_image.trim() } : {}),
      ...(form.workflow_type === "inpainting" ? { mask_image: form.mask_image.trim() } : {}),
      ...(form.workflow_type === "face-morph" ? { target_image: form.target_image.trim() } : {}),
      ...(form.reference_image.trim()
        ? { reference_image: form.reference_image.trim(), reference_weight: form.reference_weight, reference_noise: form.reference_noise }
        : {}),
      ...(form.controlnet_image.trim() && form.controlnet_type
        ? { controlnet_image: form.controlnet_image.trim(), controlnet_type: form.controlnet_type, controlnet_strength: form.controlnet_strength }
        : {}),
    };

    await generate(payload);
  };

  const onSaveProjectContext = async () => {
    if (!onSaveProjectSystemContext) return;
    setProjectSystemContextMsg(null);
    setProjectSystemContextSaving(true);
    const ok = await onSaveProjectSystemContext(projectSystemContextInput);
    setProjectSystemContextMsg({
      text: ok ? "Project image context saved" : "Failed to save project image context",
      type: ok ? "success" : "error",
    });
    setProjectSystemContextSaving(false);
  };

  const onReset = () => {
    setForm({ ...DEFAULT_FORM, ...prefsDefaults, model_name: models[0] ?? "" });
    setErrors({});
    upload.resetAll();
    clearStorage();
  };

  const onUseDefaults = () => {
    setForm({ ...DEFAULT_FORM, ...prefsDefaults, prompt: form.prompt, model_name: form.model_name });
    clearStorage();
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

  return (
    <TooltipProvider>
      <form onSubmit={onSubmit} className="space-y-3 rounded-md border p-4">
        {/* Header - always visible */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Wand2 className="h-4 w-4" />
            Generate Image
          </h2>
          <div className="flex items-center gap-1.5">
            {comfyuiAvailable && <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="ComfyUI available" title="ComfyUI available" />}
            {comfyuiStarting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <Badge variant="outline" className="text-[11px] capitalize">
              {currentGeneration ? currentGeneration.status : comfyuiBadgeLabel}
            </Badge>
          </div>
        </div>

        {/* ComfyUI warning */}
        {comfyuiAvailable === false && (
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                {comfyuiStarting
                  ? `Starting ComfyUI${comfyuiStartupSeconds > 0 ? ` (${comfyuiStartupSeconds}s)` : ""}...`
                  : "ComfyUI is currently unavailable. Generation requests may fail."}
              </span>
            </div>
            {comfyuiStatusMessage && (
              <p className="text-[11px] leading-relaxed text-yellow-800/90 dark:text-yellow-300/90">{comfyuiStatusMessage}</p>
            )}
            <div>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { void onStartComfyui?.(); }} disabled={comfyuiStarting || !onStartComfyui}>
                {comfyuiStarting ? (<><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Starting...</>) : "Start ComfyUI"}
              </Button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={formTab} onValueChange={(v) => setFormTab(v as FormTab)}>
          <TabsList className="grid grid-cols-4 w-full" aria-label="Image generation settings">
            {(["prompt", "model", "settings", "images"] as const).map((tab) => (
              <TabsTrigger key={tab} value={tab} className="relative capitalize text-xs">
                {tab}
                {errorTabSet.has(tab) && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-destructive" aria-label={`${tab} tab has errors`} />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="prompt" className="mt-3">
            <PromptTabContent
              workflowType={form.workflow_type}
              onWorkflowChange={(v) => setForm((prev) => ({ ...prev, workflow_type: v }))}
              prompt={form.prompt}
              onPromptChange={(v) => setForm((prev) => ({ ...prev, prompt: v }))}
              negativePrompt={form.negative_prompt}
              onNegativePromptChange={(v) => setForm((prev) => ({ ...prev, negative_prompt: v }))}
              promptError={errors.prompt}
              negativePromptError={errors.negative_prompt}
              onPresetSelect={handlePresetSelect}
              currentWorkflowSettings={{ width: form.width, height: form.height, steps: form.steps, cfg_scale: form.cfg_scale, sampler_name: form.sampler_name, model_name: form.model_name }}
              showProjectContext={!!onSaveProjectSystemContext}
              projectSystemContextInput={projectSystemContextInput}
              onProjectSystemContextChange={setProjectSystemContextInput}
              onSaveProjectContext={onSaveProjectContext}
              projectSystemContextSaving={projectSystemContextSaving}
              projectSystemContextMsg={projectSystemContextMsg}
            />
          </TabsContent>

          <TabsContent value="model" className="mt-3">
            <ModelTabContent
              modelName={form.model_name}
              onModelChange={(v) => setForm((prev) => ({ ...prev, model_name: v }))}
              models={models}
              optionsLoading={optionsLoading}
              samplerName={form.sampler_name}
              onSamplerChange={(v) => setForm((prev) => ({ ...prev, sampler_name: v }))}
              samplerOptions={samplerOptions}
              scheduler={form.scheduler}
              onSchedulerChange={(v) => setForm((prev) => ({ ...prev, scheduler: v }))}
              schedulerOptions={schedulerOptions}
              loras={form.loras}
              loraOptions={loraOptions}
              loraError={errors.loras}
              onLoraAdd={() => setForm((prev) => ({ ...prev, loras: [...prev.loras, defaultLora(loraOptions)] }))}
              onLoraUpdate={(i, next) => setForm((prev) => { const loras = [...prev.loras]; loras[i] = { ...loras[i], ...next }; return { ...prev, loras }; })}
              onLoraRemove={(i) => setForm((prev) => ({ ...prev, loras: prev.loras.filter((_, idx) => idx !== i) }))}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-3">
            <SettingsTabContent
              width={form.width}
              onWidthChange={(v) => setForm((prev) => ({ ...prev, width: v }))}
              height={form.height}
              onHeightChange={(v) => setForm((prev) => ({ ...prev, height: v }))}
              steps={form.steps}
              onStepsChange={(v) => setForm((prev) => ({ ...prev, steps: v }))}
              cfgScale={form.cfg_scale}
              onCfgScaleChange={(v) => setForm((prev) => ({ ...prev, cfg_scale: v }))}
              batchSize={form.batch_size}
              onBatchSizeChange={(v) => setForm((prev) => ({ ...prev, batch_size: v }))}
              seed={form.seed}
              onSeedChange={(v) => setForm((prev) => ({ ...prev, seed: v }))}
              errors={errors}
            />
          </TabsContent>

          <TabsContent value="images" className="mt-3">
            <ImagesTabContent
              workflowType={form.workflow_type}
              inputImagePreview={upload.previews.input_image}
              inputImageUploadName={upload.uploadNames.input_image}
              inputImageError={errors.input_image}
              onInputImageDrop={upload.onDrop("input_image", handleFormUpload)}
              onInputImageUpload={upload.onImageUpload("input_image", handleFormUpload)}
              denoise={form.denoise}
              onDenoiseChange={(v) => setForm((prev) => ({ ...prev, denoise: v }))}
              denoiseError={errors.denoise}
              maskImagePreview={upload.previews.mask_image}
              maskImageUploadName={upload.uploadNames.mask_image}
              maskImageError={errors.mask_image}
              onMaskChange={(dataUrl) => {
                setForm((prev) => ({ ...prev, mask_image: dataUrl }));
                upload.setPreviews((prev) => ({ ...prev, mask_image: dataUrl }));
                upload.setUploadNames((prev) => ({ ...prev, mask_image: "editor-mask.png" }));
                setErrors((prev) => { if (!prev.mask_image) return prev; const next = { ...prev }; delete next.mask_image; return next; });
              }}
              onMaskClear={() => {
                setForm((prev) => ({ ...prev, mask_image: "" }));
                upload.setPreviews((prev) => ({ ...prev, mask_image: null }));
                upload.setUploadNames((prev) => ({ ...prev, mask_image: null }));
              }}
              onMaskImageDrop={upload.onDrop("mask_image", handleFormUpload)}
              onMaskImageUpload={upload.onImageUpload("mask_image", handleFormUpload)}
              targetImagePreview={upload.previews.target_image}
              targetImageUploadName={upload.uploadNames.target_image}
              targetImageError={errors.target_image}
              onTargetImageDrop={upload.onDrop("target_image", handleFormUpload)}
              onTargetImageUpload={upload.onImageUpload("target_image", handleFormUpload)}
              morphStrength={form.morph_strength}
              onMorphStrengthChange={(v) => setForm((prev) => ({ ...prev, morph_strength: v }))}
              morphStrengthError={errors.morph_strength}
              showReferenceImage={showReferenceImage}
              onToggleReferenceImage={() => setShowReferenceImage((v) => !v)}
              referenceImage={form.reference_image}
              referenceWeight={form.reference_weight}
              referenceNoise={form.reference_noise}
              referencePreview={upload.previews.reference_image}
              referenceUploadName={upload.uploadNames.reference_image}
              referenceError={errors.reference_image}
              onReferenceDrop={upload.onDrop("reference_image", handleFormUpload)}
              onReferenceUpload={upload.onImageUpload("reference_image", handleFormUpload)}
              onReferenceClear={() => { setForm((prev) => ({ ...prev, reference_image: "" })); upload.clearField("reference_image"); }}
              onReferenceWeightChange={(v) => setForm((prev) => ({ ...prev, reference_weight: v }))}
              onReferenceNoiseChange={(v) => setForm((prev) => ({ ...prev, reference_noise: v }))}
              showControlNet={showControlNet}
              onToggleControlNet={() => setShowControlNet((v) => !v)}
              controlnetImage={form.controlnet_image}
              controlnetType={form.controlnet_type}
              controlnetStrength={form.controlnet_strength}
              controlnetTypes={imageOptions?.controlnet_types ?? ["canny", "depth", "openpose", "lineart", "scribble", "softedge"]}
              controlnetPreview={upload.previews.controlnet_image}
              controlnetUploadName={upload.uploadNames.controlnet_image}
              controlnetError={errors.controlnet_image}
              onControlnetDrop={upload.onDrop("controlnet_image", handleFormUpload)}
              onControlnetUpload={upload.onImageUpload("controlnet_image", handleFormUpload)}
              onControlnetClear={() => { setForm((prev) => ({ ...prev, controlnet_image: "", controlnet_type: "" })); upload.clearField("controlnet_image"); }}
              onControlnetTypeChange={(v) => setForm((prev) => ({ ...prev, controlnet_type: v }))}
              onControlnetStrengthChange={(v) => setForm((prev) => ({ ...prev, controlnet_strength: v }))}
              onPickFromGallery={generations.length > 0 ? openGalleryPicker : undefined}
            />
          </TabsContent>
        </Tabs>

        {/* Errors - always visible */}
        {upload.uploadError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{upload.uploadError}</span>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action buttons - always visible */}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={generating || comfyuiAvailable === false} className="flex-1">
            {generating ? (<><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Generating...</>) : "Generate"}
          </Button>
          <Button type="button" variant="outline" onClick={onReset} disabled={generating}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Reset
          </Button>
          {generating && <Button type="button" variant="ghost" onClick={cancelGeneration}>Stop Polling</Button>}
        </div>

        {(userPreferences || onSaveAsDefault) && (
          <div className="flex items-center gap-2 pt-1 border-t">
            {userPreferences && (
              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onUseDefaults} disabled={generating}>
                <RotateCcw className="h-3 w-3 mr-1" />Use defaults
              </Button>
            )}
            {onSaveAsDefault && (
              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onSaveCurrentAsDefault} disabled={generating}>
                <Save className="h-3 w-3 mr-1" />Save as default
              </Button>
            )}
          </div>
        )}
      </form>
      <GalleryPickerDialog
        open={galleryPickerOpen}
        onOpenChange={setGalleryPickerOpen}
        generations={generations}
        onSelect={handleGallerySelect}
      />
    </TooltipProvider>
  );
}
