export type ImageGenerationStatus = "pending" | "processing" | "completed" | "failed";

export type WorkflowType =
  | "text-to-image"
  | "image-to-image"
  | "inpainting"
  | "face-morph"
  | "upscale";

export interface LoraConfig {
  name: string;
  strength_model: number;
  strength_clip: number;
}

export interface ImageGenerationRequest {
  project_id?: string;
  workflow_type: WorkflowType;
  system_context?: string;
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  input_image?: string;
  mask_image?: string;
  target_image?: string;
  denoise?: number;
  morph_strength?: number;
  seed?: number;
  sampler_name?: string;
  scheduler?: string;
  batch_size?: number;
  model_name?: string;
  loras?: LoraConfig[];
  // IPAdapter reference image
  reference_image?: string;
  reference_weight?: number;
  reference_noise?: number;
  // ControlNet
  controlnet_image?: string;
  controlnet_type?: string;
  controlnet_strength?: number;
  // Upscaling
  upscale_model?: string;
  source_generation_id?: string;
}

export interface ImageGenerationProgress {
  queue_position?: number | null;
  queue_pending: number;
  queue_running: number;
}

export interface ImageGenerationResponse {
  id: string;
  user_id: string;
  project_id?: string | null;
  workflow_type: WorkflowType;
  prompt: string;
  negative_prompt?: string | null;
  status: ImageGenerationStatus;
  result_images: string[];
  error_message?: string | null;
  comfyui_job_id?: string | null;
  progress?: ImageGenerationProgress | null;
  seed_used?: number | null;
  is_favorite: boolean;
  generation_metadata?: Record<string, unknown> | null;
  source_generation_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ImageGenerationListResponse {
  generations: ImageGenerationResponse[];
  count: number;
}

export interface ComfyUIStartResponse {
  started: boolean;
  already_running: boolean;
  healthy: boolean;
  message: string;
  container_status?: string | null;
  health_status?: string | null;
}

export interface ImageModelInfo {
  filename: string;
  model_type: "sd15" | "sdxl";
}

export interface LoraInfo {
  filename: string;
  model_type: "sd15" | "sdxl" | "both";
}

export interface ImageGenerationOptionsResponse {
  models: string[];
  model_details: ImageModelInfo[];
  loras: string[];
  lora_details: LoraInfo[];
  samplers: string[];
  schedulers: string[];
  workflows: WorkflowType[];
  upscale_models: string[];
  controlnet_types: string[];
}
