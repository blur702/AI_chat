export interface PromptPresetCreate {
  name: string;
  prompt_text: string;
  negative_prompt_text?: string | null;
  category?: string;
  tags?: string[] | null;
  workflow_settings?: Record<string, unknown> | null;
  is_public?: boolean;
}

export interface PromptPresetUpdate {
  name?: string;
  prompt_text?: string;
  negative_prompt_text?: string | null;
  category?: string;
  tags?: string[] | null;
  workflow_settings?: Record<string, unknown> | null;
  is_public?: boolean;
}

export interface PromptPresetResponse {
  id: string;
  user_id: string;
  name: string;
  prompt_text: string;
  negative_prompt_text: string | null;
  category: string;
  tags: string[] | null;
  workflow_settings: Record<string, unknown> | null;
  is_public: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface PromptPresetListResponse {
  presets: PromptPresetResponse[];
  count: number;
}
