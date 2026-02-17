"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { AlertCircle, AlertTriangle, ChevronDown, Info, Loader2, Plus, RotateCcw, Save, Trash2, Wand2, X } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";
import { PromptPresets } from "./prompt-presets";
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
  // IPAdapter reference image
  reference_image: string;
  reference_weight: number;
  reference_noise: number;
  // ControlNet
  controlnet_image: string;
  controlnet_type: string;
  controlnet_strength: number;
}

type UploadField = "input_image" | "mask_image" | "target_image" | "reference_image" | "controlnet_image";

const STORAGE_KEY_PREFIX = "image-gen-form:";
const MAX_UPLOAD_MB = 10;
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

function defaultLora(loras: string[]): LoraConfig {
  return {
    name: loras[0] ?? "",
    strength_model: 1,
    strength_clip: 1,
  };
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [maskEditorError, setMaskEditorError] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(28);
  const [maskTool, setMaskTool] = useState<"paint" | "erase">("paint");
  const [previews, setPreviews] = useState<Record<UploadField, string | null>>({
    input_image: null,
    mask_image: null,
    target_image: null,
    reference_image: null,
    controlnet_image: null,
  });
  const [uploadNames, setUploadNames] = useState<Record<UploadField, string | null>>({
    input_image: null,
    mask_image: null,
    target_image: null,
    reference_image: null,
    controlnet_image: null,
  });
  const [showReferenceImage, setShowReferenceImage] = useState(() => !!form.reference_image);
  const [showControlNet, setShowControlNet] = useState(() => !!form.controlnet_image);
  const [projectSystemContextInput, setProjectSystemContextInput] = useState(projectSystemContext ?? "");
  const [projectSystemContextSaving, setProjectSystemContextSaving] = useState(false);
  const [projectSystemContextMsg, setProjectSystemContextMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskDrawingRef = useRef(false);
  const maskLastPointRef = useRef<{ x: number; y: number } | null>(null);

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

  const createImageElement = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = src;
    });

  const clearMaskValidationError = () => {
    setErrors((prev) => {
      if (!prev.mask_image) return prev;
      const next = { ...prev };
      delete next.mask_image;
      return next;
    });
  };

  const pushCanvasMaskToForm = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setForm((prev) => ({ ...prev, mask_image: dataUrl }));
    setPreviews((prev) => ({ ...prev, mask_image: dataUrl }));
    setUploadNames((prev) => ({ ...prev, mask_image: "editor-mask.png" }));
    clearMaskValidationError();
  };

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const paintMaskStroke = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = maskTool === "paint" ? "#FFFFFF" : "#000000";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  };

  const onMaskPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);
    if (!point) return;
    event.preventDefault();
    maskDrawingRef.current = true;
    maskLastPointRef.current = point;
    paintMaskStroke(point, point);
  };

  const onMaskPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!maskDrawingRef.current) return;
    const point = getCanvasPoint(event);
    if (!point || !maskLastPointRef.current) return;
    event.preventDefault();
    paintMaskStroke(maskLastPointRef.current, point);
    maskLastPointRef.current = point;
  };

  const finishMaskDraw = () => {
    if (!maskDrawingRef.current) return;
    maskDrawingRef.current = false;
    maskLastPointRef.current = null;
    pushCanvasMaskToForm();
  };

  const clearMaskCanvas = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setForm((prev) => ({ ...prev, mask_image: "" }));
    setPreviews((prev) => ({ ...prev, mask_image: null }));
    setUploadNames((prev) => ({ ...prev, mask_image: null }));
  };

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
    if (Object.keys(prefsDefaults).length > 0) {
      setForm((prev) => ({ ...prev, ...prefsDefaults }));
    }
  }, [storageKey, prefsDefaults]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(form));
  }, [form, storageKey]);

  useEffect(() => {
    setProjectSystemContextInput(projectSystemContext ?? "");
  }, [projectSystemContext]);

  useEffect(() => {
    const setupMaskEditor = async () => {
      if (form.workflow_type !== "inpainting") return;
      if (!previews.input_image) return;
      const canvas = maskCanvasRef.current;
      if (!canvas) return;

      try {
        setMaskEditorError(null);
        const baseImage = await createImageElement(previews.input_image);
        canvas.width = baseImage.naturalWidth;
        canvas.height = baseImage.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (previews.mask_image) {
          const maskImage = await createImageElement(previews.mask_image);
          ctx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
        }
      } catch {
        setMaskEditorError("Could not initialize the inpaint mask editor.");
      }
    };

    void setupMaskEditor();
  }, [form.workflow_type, previews.input_image, previews.mask_image]);

  useEffect(() => {
    setForm((prev) => {
      let changed = false;
      let next = prev;
      if (!prev.model_name && models.length > 0) {
        next = { ...next, model_name: models[0] };
        changed = true;
      }
      if (!prev.sampler_name && samplerOptions.length > 0) {
        next = { ...next, sampler_name: samplerOptions[0] };
        changed = true;
      }
      if (!prev.scheduler && schedulerOptions.length > 0) {
        next = { ...next, scheduler: schedulerOptions[0] };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [models, samplerOptions, schedulerOptions]);

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

    if (form.workflow_type !== "text-to-image" && !form.input_image.trim()) {
      nextErrors.input_image = "Input image is required.";
    }
    if (form.workflow_type === "inpainting" && !form.mask_image.trim()) {
      nextErrors.mask_image = "Mask image is required for inpainting.";
    }
    if (form.workflow_type === "face-morph" && !form.target_image.trim()) {
      nextErrors.target_image = "Target image is required for face morph.";
    }

    if (form.loras.some((l) => !l.name.trim())) {
      nextErrors.loras = "Each LoRA entry needs a valid name.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
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
      ...(form.workflow_type !== "text-to-image"
        ? { input_image: form.input_image.trim() }
        : {}),
      ...(form.workflow_type === "inpainting"
        ? { mask_image: form.mask_image.trim() }
        : {}),
      ...(form.workflow_type === "face-morph"
        ? { target_image: form.target_image.trim() }
        : {}),
      ...(form.reference_image.trim()
        ? {
            reference_image: form.reference_image.trim(),
            reference_weight: form.reference_weight,
            reference_noise: form.reference_noise,
          }
        : {}),
      ...(form.controlnet_image.trim() && form.controlnet_type
        ? {
            controlnet_image: form.controlnet_image.trim(),
            controlnet_type: form.controlnet_type,
            controlnet_strength: form.controlnet_strength,
          }
        : {}),
    };

    await generate(payload);
  };

  const onSaveProjectContext = async () => {
    if (!onSaveProjectSystemContext) return;
    setProjectSystemContextMsg(null);
    setProjectSystemContextSaving(true);
    const ok = await onSaveProjectSystemContext(projectSystemContextInput);
    if (ok) {
      setProjectSystemContextMsg({ text: "Project image context saved", type: "success" });
    } else {
      setProjectSystemContextMsg({ text: "Failed to save project image context", type: "error" });
    }
    setProjectSystemContextSaving(false);
  };

  const resetUploads = () => {
    setPreviews({ input_image: null, mask_image: null, target_image: null, reference_image: null, controlnet_image: null });
    setUploadNames({ input_image: null, mask_image: null, target_image: null, reference_image: null, controlnet_image: null });
    setUploadError(null);
    setMaskEditorError(null);
  };

  const onReset = () => {
    setForm({ ...DEFAULT_FORM, ...prefsDefaults, model_name: models[0] ?? "" });
    setErrors({});
    resetUploads();
    sessionStorage.removeItem(storageKey);
  };

  const onUseDefaults = () => {
    setForm({ ...DEFAULT_FORM, ...prefsDefaults, prompt: form.prompt, model_name: form.model_name });
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

  const processFile = (file: File, field: UploadField) => {
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

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPreviews((prev) => {
        if (field !== "input_image") return { ...prev, [field]: base64 };
        return { ...prev, input_image: base64, mask_image: null };
      });
      setUploadNames((prev) => {
        if (field !== "input_image") return { ...prev, [field]: file.name };
        return { ...prev, input_image: file.name, mask_image: null };
      });
      setForm((prev) => {
        if (field !== "input_image") return { ...prev, [field]: base64 };
        return { ...prev, input_image: base64, mask_image: "" };
      });
      if (field === "input_image") {
        setMaskEditorError(null);
      }
    };
    reader.onerror = () => {
      setPreviews((prev) => ({ ...prev, [field]: null }));
      setUploadNames((prev) => ({ ...prev, [field]: null }));
      setForm((prev) => ({ ...prev, [field]: "" }));
      setUploadError("Failed to read image file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const onImageUpload = (field: UploadField) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file, field);
  };

  const onDrop = (field: UploadField) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) processFile(file, field);
  };

  const addLora = () => {
    setForm((prev) => ({ ...prev, loras: [...prev.loras, defaultLora(loraOptions)] }));
  };

  const updateLora = (index: number, next: Partial<LoraConfig>) => {
    setForm((prev) => {
      const loras = [...prev.loras];
      loras[index] = { ...loras[index], ...next };
      return { ...prev, loras };
    });
  };

  const removeLora = (index: number) => {
    setForm((prev) => ({ ...prev, loras: prev.loras.filter((_, i) => i !== index) }));
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <p className="text-[11px] text-destructive mt-1">{errors[key]}</p>
    ) : null;

  const renderUploadField = (field: UploadField, label: string, description: string) => (
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
        onDrop={onDrop(field)}
        onDragOver={(e) => e.preventDefault()}
        className="mt-1 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center border-muted-foreground/25"
      >
        {previews[field] ? (
          <img
            src={previews[field] || ""}
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
          onChange={onImageUpload(field)}
        />
      </div>
      {uploadNames[field] && (
        <p className="mt-1 text-[11px] text-muted-foreground">Selected: {uploadNames[field]}</p>
      )}
      {fieldError(field)}
    </div>
  );

  return (
    <TooltipProvider>
      <form onSubmit={onSubmit} className="space-y-4 rounded-md border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Wand2 className="h-4 w-4" />
            Generate Image
          </h2>
          <div className="flex items-center gap-1.5">
            {comfyuiAvailable && (
              <span
                className="h-2 w-2 rounded-full bg-emerald-500"
                aria-label="ComfyUI available"
                title="ComfyUI available"
              />
            )}
            {comfyuiStarting && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <Badge variant="outline" className="text-[11px] capitalize">
              {currentGeneration ? currentGeneration.status : comfyuiBadgeLabel}
            </Badge>
          </div>
        </div>

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
              <p className="text-[11px] leading-relaxed text-yellow-800/90 dark:text-yellow-300/90">
                {comfyuiStatusMessage}
              </p>
            )}
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => {
                  void onStartComfyui?.();
                }}
                disabled={comfyuiStarting || !onStartComfyui}
              >
                {comfyuiStarting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Starting...
                  </>
                ) : (
                  "Start ComfyUI"
                )}
              </Button>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium flex items-center gap-1 mb-1.5">Workflow <FieldHelp slug="imagegen-workflow" tip="Generation mode: text-to-image, img2img, inpaint, face-morph" /></label>
          <Tabs
            value={form.workflow_type}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                workflow_type: value as WorkflowType,
              }))
            }
          >
            <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="text-to-image">Text</TabsTrigger>
            <TabsTrigger value="image-to-image">Img2Img</TabsTrigger>
            <TabsTrigger value="inpainting">Inpaint</TabsTrigger>
            <TabsTrigger value="face-morph">Face Morph</TabsTrigger>
          </TabsList>
        </Tabs>
        </div>

        <PromptPresets
          onSelect={handlePresetSelect}
          currentPrompt={form.prompt}
          currentNegativePrompt={form.negative_prompt}
          currentWorkflowSettings={{
            width: form.width,
            height: form.height,
            steps: form.steps,
            cfg_scale: form.cfg_scale,
            sampler_name: form.sampler_name,
            model_name: form.model_name,
          }}
        />

        <div>
          <label className="text-xs font-medium flex items-center gap-1">Prompt <FieldHelp slug="imagegen-prompt" tip="Describe the image you want" /></label>
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

        {onSaveProjectSystemContext && (
          <div className="rounded-md border p-3 space-y-2">
            <label className="text-xs font-medium flex items-center gap-1">
              Project Image Context
              <FieldHelp slug="imagegen-project-system-context" tip="Project-wide instructions used for image generation in this project" />
            </label>
            <textarea
              value={projectSystemContextInput}
              onChange={(event) => setProjectSystemContextInput(event.target.value)}
              className="min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Optional project-level image instructions (style, composition, quality rules)"
              maxLength={4000}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">{projectSystemContextInput.length}/4000</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onSaveProjectContext}
                disabled={projectSystemContextSaving}
              >
                {projectSystemContextSaving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Save project context
              </Button>
            </div>
            {projectSystemContextMsg && (
              <p className={`text-[11px] ${projectSystemContextMsg.type === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                {projectSystemContextMsg.text}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-medium flex items-center gap-1">Negative Prompt <FieldHelp slug="imagegen-negative-prompt" tip="What to avoid in the image" /></label>
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

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs font-medium flex items-center gap-1">Model <FieldHelp slug="imagegen-model" tip="Checkpoint model used for generation" /></label>
            {models.length > 0 ? (
              <select
                value={form.model_name}
                onChange={(event) => setForm((prev) => ({ ...prev, model_name: event.target.value }))}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            ) : (
              <Input
                value={form.model_name}
                onChange={(event) => setForm((prev) => ({ ...prev, model_name: event.target.value }))}
                placeholder={optionsLoading ? "Loading models..." : "Enter model checkpoint name"}
                className="mt-1"
              />
            )}
          </div>
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
              <label className="text-xs font-medium flex items-center gap-1">Width <FieldHelp slug="imagegen-width" tip="Image width in pixels" /></label>
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
              <label className="text-xs font-medium flex items-center gap-1">Height <FieldHelp slug="imagegen-height" tip="Image height in pixels" /></label>
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
            <span className="flex items-center gap-1">Steps <FieldHelp slug="imagegen-steps" tip="More steps usually improve quality but take longer." /></span>
            <span>{form.steps}</span>
          </label>
          <input
            type="range"
            min={1}
            max={150}
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
            <span className="flex items-center gap-1">CFG Scale <FieldHelp slug="imagegen-cfg-scale" tip="Controls how strongly generation follows your prompt." /></span>
            <span>{form.cfg_scale.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min={1}
            max={30}
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium flex items-center gap-1">Sampler <FieldHelp slug="imagegen-sampler" tip="Sampling algorithm (euler, dpmpp_2m, etc.)" /></label>
            <select
              value={form.sampler_name}
              onChange={(event) => setForm((prev) => ({ ...prev, sampler_name: event.target.value }))}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {samplerOptions.map((sampler) => (
                <option key={sampler} value={sampler}>{sampler}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium flex items-center gap-1">Scheduler <FieldHelp slug="imagegen-scheduler" tip="Noise schedule (normal, karras, exponential)" /></label>
            <select
              value={form.scheduler}
              onChange={(event) => setForm((prev) => ({ ...prev, scheduler: event.target.value }))}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {schedulerOptions.map((scheduler) => (
                <option key={scheduler} value={scheduler}>{scheduler}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium flex items-center gap-1">Batch Size <FieldHelp slug="imagegen-batch-size" tip="Generate multiple images at once" /></label>
            <Input
              type="number"
              min={1}
              max={8}
              value={form.batch_size}
              onChange={(event) => setForm((prev) => ({ ...prev, batch_size: Number(event.target.value || 1) }))}
              className="mt-1"
            />
            {fieldError("batch_size")}
          </div>
          <div>
            <label className="text-xs font-medium flex items-center gap-1">Seed <FieldHelp slug="imagegen-seed" tip="Fixed seed for reproducibility. Empty = random." /></label>
            <Input
              value={form.seed}
              onChange={(event) => setForm((prev) => ({ ...prev, seed: event.target.value.replace(/[^0-9]/g, "") }))}
              placeholder="Random if empty"
              className="mt-1"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium flex items-center gap-1">LoRA Stack <FieldHelp slug="imagegen-lora" tip="Add style/subject LoRA models" /></p>
            <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px]" onClick={addLora}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add LoRA
            </Button>
          </div>
          {form.loras.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No LoRAs selected.</p>
          )}
          {form.loras.map((lora, index) => (
            <div key={`${lora.name}-${index}`} className="grid grid-cols-[1fr_auto] gap-2 rounded border p-2">
              <div className="space-y-2">
                {loraOptions.length > 0 ? (
                  <select
                    value={lora.name}
                    onChange={(event) => updateLora(index, { name: event.target.value })}
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  >
                    {loraOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={lora.name}
                    onChange={(event) => updateLora(index, { name: event.target.value })}
                    placeholder="LoRA filename"
                    className="h-8 text-xs"
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    step={0.1}
                    value={lora.strength_model}
                    onChange={(event) => updateLora(index, { strength_model: Number(event.target.value) })}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    step={0.1}
                    value={lora.strength_clip}
                    onChange={(event) => updateLora(index, { strength_clip: Number(event.target.value) })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLora(index)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {fieldError("loras")}
        </div>

        {/* Reference Image (IPAdapter Style Transfer) */}
        <div className="rounded-md border">
          <button
            type="button"
            className="flex w-full items-center justify-between p-3 text-xs font-medium hover:bg-muted/50"
            onClick={() => setShowReferenceImage((v) => !v)}
          >
            <span className="flex items-center gap-1">Reference Image (Style Transfer) <FieldHelp slug="imagegen-reference-image" tip="IPAdapter style transfer from reference" /></span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showReferenceImage ? "rotate-180" : ""}`} />
          </button>
          {showReferenceImage && (
            <div className="space-y-3 border-t p-3">
              <p className="text-[11px] text-muted-foreground">
                Upload a reference image for IPAdapter style transfer. The output will adopt the visual style and composition of the reference.
              </p>
              {renderUploadField("reference_image", "Reference Image", "Upload a style reference image (PNG/JPEG/WEBP).")}
              {form.reference_image && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, reference_image: "" }));
                    setPreviews((prev) => ({ ...prev, reference_image: null }));
                    setUploadNames((prev) => ({ ...prev, reference_image: null }));
                  }}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear reference
                </Button>
              )}
              <div>
                <label className="text-xs font-medium flex items-center justify-between gap-2">
                  <span>Style Weight</span>
                  <span>{(form.reference_weight * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={form.reference_weight}
                  onChange={(e) => setForm((prev) => ({ ...prev, reference_weight: Number(e.target.value) }))}
                  className="mt-1 w-full"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Higher = stronger style influence (0-150%)</p>
              </div>
              <div>
                <label className="text-xs font-medium flex items-center justify-between gap-2">
                  <span>Variation/Noise</span>
                  <span>{(form.reference_noise * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.reference_noise}
                  onChange={(e) => setForm((prev) => ({ ...prev, reference_noise: Number(e.target.value) }))}
                  className="mt-1 w-full"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Add variation to the style transfer (0 = exact, 100% = high variation)</p>
              </div>
            </div>
          )}
        </div>

        {/* ControlNet */}
        <div className="rounded-md border">
          <button
            type="button"
            className="flex w-full items-center justify-between p-3 text-xs font-medium hover:bg-muted/50"
            onClick={() => setShowControlNet((v) => !v)}
          >
            <span className="flex items-center gap-1">ControlNet (Structure Guide) <FieldHelp slug="imagegen-controlnet" tip="Guide output with structure images" /></span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showControlNet ? "rotate-180" : ""}`} />
          </button>
          {showControlNet && (
            <div className="space-y-3 border-t p-3">
              <p className="text-[11px] text-muted-foreground">
                Upload a guide image and select a ControlNet type. The output will follow the structure of the guide.
              </p>
              <div>
                <label htmlFor="controlnet-type-select" className="text-xs font-medium">ControlNet Type</label>
                <select
                  id="controlnet-type-select"
                  value={form.controlnet_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, controlnet_type: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Select type...</option>
                  {(imageOptions?.controlnet_types ?? ["canny", "depth", "openpose", "lineart", "scribble", "softedge"]).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {renderUploadField("controlnet_image", "ControlNet Image", "Upload a structure guide image (edges, depth map, pose, etc.).")}
              {form.controlnet_image && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, controlnet_image: "", controlnet_type: "" }));
                    setPreviews((prev) => ({ ...prev, controlnet_image: null }));
                    setUploadNames((prev) => ({ ...prev, controlnet_image: null }));
                  }}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear ControlNet
                </Button>
              )}
              <div>
                <label className="text-xs font-medium flex items-center justify-between gap-2">
                  <span>Strength</span>
                  <span>{form.controlnet_strength.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={form.controlnet_strength}
                  onChange={(e) => setForm((prev) => ({ ...prev, controlnet_strength: Number(e.target.value) }))}
                  className="mt-1 w-full"
                />
                <p className="text-[11px] text-muted-foreground mt-1">How closely to follow the structure guide (0-2)</p>
              </div>
            </div>
          )}
        </div>

        {form.workflow_type !== "text-to-image" && (
          <>
            {renderUploadField("input_image", "Input Image", `Upload max ${MAX_UPLOAD_MB}MB (PNG/JPEG/WEBP).`)}

            <div>
              <label className="text-xs font-medium flex items-center justify-between gap-2">
                <span className="flex items-center gap-1">Denoise <FieldHelp slug="imagegen-denoise" tip="How much to change the input image (0=none, 1=full)" /></span>
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

            {form.workflow_type === "inpainting" && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium flex items-center gap-1">
                    Inpaint Mask Editor <FieldHelp slug="imagegen-mask-editor" tip="Paint regions to regenerate" />
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={maskTool === "paint" ? "secondary" : "ghost"}
                      className="h-6 text-[11px]"
                      onClick={() => setMaskTool("paint")}
                    >
                      Paint
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={maskTool === "erase" ? "secondary" : "ghost"}
                      className="h-6 text-[11px]"
                      onClick={() => setMaskTool("erase")}
                    >
                      Erase
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <label className="text-[11px] text-muted-foreground">Brush: {brushSize}px</label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px]"
                    onClick={clearMaskCanvas}
                  >
                    Clear mask
                  </Button>
                </div>
                <input
                  type="range"
                  min={4}
                  max={128}
                  step={2}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  className="w-full"
                />
                {previews.input_image ? (
                  <div className="relative overflow-hidden rounded-md border bg-black/40">
                    <img
                      src={previews.input_image}
                      alt="Inpaint input preview"
                      className="block w-full h-auto select-none pointer-events-none"
                    />
                    <canvas
                      ref={maskCanvasRef}
                      className="absolute inset-0 h-full w-full touch-none cursor-crosshair opacity-50"
                      onPointerDown={onMaskPointerDown}
                      onPointerMove={onMaskPointerMove}
                      onPointerUp={finishMaskDraw}
                      onPointerCancel={finishMaskDraw}
                      onPointerLeave={finishMaskDraw}
                    />
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Upload an input image first to paint an inpainting mask.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Paint white to regenerate areas, erase back to black to keep the original image.
                </p>
                {maskEditorError && (
                  <p className="text-[11px] text-destructive">{maskEditorError}</p>
                )}
                <div className="pt-1 border-t">
                  {renderUploadField("mask_image", "Mask Image Upload (optional)", "Upload a pre-made mask instead of drawing. White areas are repainted; dark areas are preserved.")}
                </div>
              </div>
            )}

            {form.workflow_type === "face-morph" && (
              <>
                {renderUploadField("target_image", "Target Face/Image", "Image to morph toward.")}
                <div>
                  <label className="text-xs font-medium flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">Morph Strength <FieldHelp slug="imagegen-morph-strength" tip="Blending intensity between input and target" /></span>
                    <span>{form.morph_strength.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={form.morph_strength}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        morph_strength: Number(event.target.value),
                      }))
                    }
                    className="mt-2 w-full"
                  />
                  {fieldError("morph_strength")}
                </div>
              </>
            )}
          </>
        )}

        {uploadError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={generating || comfyuiAvailable === false} className="flex-1">
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
