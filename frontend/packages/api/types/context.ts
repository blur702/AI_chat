export interface MessageSummary {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  is_pinned: boolean;
  is_excluded: boolean;
  created_at?: string;
}

export interface CompactionSummary {
  id: string;
  original_message_count: number;
  compacted_message_count: number;
  summary: string;
  created_at?: string;
}

export interface ConversationState {
  chat_id: string;
  project_id: string;
  title: string;
  messages: MessageSummary[];
  compactions: CompactionSummary[];
  current_token_count: number;
}

export interface ChatSummary {
  id: string;
  title: string;
  is_pinned?: boolean;
  is_archived?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ChatCreateRequest {
  project_id: string;
  title: string;
}

export interface ChatCreateResponse {
  id: string;
  title: string;
  project_id: string;
  created_at?: string;
}

export interface ChatUpdateRequest {
  title?: string;
  is_pinned?: boolean;
  is_archived?: boolean;
}

export interface ChatUpdateResponse {
  id: string;
  title: string;
  project_id: string;
  is_pinned: boolean;
  is_archived: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectContext {
  project_id: string;
  user_id: string;
  name: string;
  path: string;
  type?: string;
  settings?: Record<string, unknown>;
  custom_context?: string;
  important_files?: string[];
  chats: ChatSummary[];
}

export interface ChatListResponse {
  chats: ChatSummary[];
  count: number;
}

export interface UserPreferences {
  custom_system_prompt?: string;
  coding_principles?: unknown[];
  response_style?: Record<string, unknown>;
  default_model?: string;
  default_temperature?: number;
  email_notifications?: boolean;
  in_app_notifications?: boolean;

  // Image generation defaults
  imggen_default_workflow?: string;
  imggen_default_width?: number;
  imggen_default_height?: number;
  imggen_default_steps?: number;
  imggen_default_cfg_scale?: number;
  imggen_default_negative_prompt?: string;
  imggen_completion_notification?: boolean;
  imggen_desktop_notification?: boolean;
  imggen_sound_notification?: boolean;
  imggen_notification_sound?: string;
  imggen_auto_delete_days?: number;
  imggen_max_generations?: number;
  comfyui_base_url?: string;
}

export interface UserPreferencesUpdateRequest {
  custom_system_prompt?: string;
  coding_principles?: unknown[];
  response_style?: Record<string, unknown>;
  default_model?: string;
  default_temperature?: number;
  email_notifications?: boolean;
  in_app_notifications?: boolean;

  // Image generation defaults
  imggen_default_workflow?: string;
  imggen_default_width?: number;
  imggen_default_height?: number;
  imggen_default_steps?: number;
  imggen_default_cfg_scale?: number;
  imggen_default_negative_prompt?: string;
  imggen_completion_notification?: boolean;
  imggen_desktop_notification?: boolean;
  imggen_sound_notification?: boolean;
  imggen_notification_sound?: string;
  imggen_auto_delete_days?: number;
  imggen_max_generations?: number;
  comfyui_base_url?: string;
}

export interface ModelInfo {
  name: string;
  size?: number;
  modified_at?: string;
}

export interface ModelListResponse {
  models: ModelInfo[];
}

export interface TokenUsageRequest {
  token_count: number;
  max_tokens: number;
}

export interface TokenUsageResponse {
  current_tokens: number;
  max_tokens: number;
  usage_ratio: number;
  compaction_triggered: boolean;
}

export interface StreamTokenEvent {
  type: "token";
  content: string;
}

export interface StreamDoneEvent {
  type: "done";
  message_id: string;
  model: string;
  created_at?: string;
}

export interface StreamErrorEvent {
  type: "error";
  message: string;
}

export type StreamEvent = StreamTokenEvent | StreamDoneEvent | StreamErrorEvent;

export interface SandboxChatResponse {
  chat_id: string;
  conversation: ConversationState;
}

export interface ProjectCreateRequest {
  name: string;
  path: string;
  type?: string;
  settings?: Record<string, unknown>;
  custom_context?: string;
  important_files?: string[];
}

export interface ProjectCreateResponse {
  id: string;
  name: string;
  path: string;
  type?: string;
  created_at?: string;
}

export interface ProjectUpdateRequest {
  name?: string;
  path?: string;
  type?: string;
  settings?: Record<string, unknown>;
  custom_context?: string;
  important_files?: string[];
}

export interface ProjectUpdateResponse {
  id: string;
  name: string;
  path: string;
  type?: string;
  settings?: Record<string, unknown>;
  custom_context?: string;
  important_files?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  type?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
  count: number;
}
