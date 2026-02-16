export type ImageGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type WorkflowType =
  | "text-to-image"
  | "image-to-image"
  | "inpainting"
  | "face-morph";

export interface LoraConfig {
  name: string;
  strength_model: number;
  strength_clip: number;
}

export interface ImageGenerationRequest {
  project_id?: string;
  workflow_type: WorkflowType;
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

export interface ImageGenerationOptionsResponse {
  models: string[];
  loras: string[];
  samplers: string[];
  schedulers: string[];
  workflows: WorkflowType[];
}
