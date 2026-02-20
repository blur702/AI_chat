export interface OllamaModelDetails {
  family?: string;
  parameter_size?: string;
  quantization_level?: string;
  format?: string;
}

export interface OllamaModelInfo {
  name: string;
  size?: number;
  modified_at?: string;
  details?: OllamaModelDetails;
  description?: string;
}

export interface RunningModelInfo {
  name: string;
  size_vram?: number;
  size_disk?: number;
  expires_at?: string;
  details?: OllamaModelDetails;
}

export interface RemoteModelInfo {
  name: string;
  description: string;
  sizes: string[];
}

export interface OllamaModelListResponse {
  local: OllamaModelInfo[];
  running: RunningModelInfo[];
  remote: RemoteModelInfo[];
}

export interface ModelActionResponse {
  success: boolean;
  model_name: string;
  action: string;
  message: string;
}

export interface ModelPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  percent?: number;
  message?: string;
}
