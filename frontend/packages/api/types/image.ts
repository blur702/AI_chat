export type ImageGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type WorkflowType = "text-to-image" | "image-to-image";

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
  denoise?: number;
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
