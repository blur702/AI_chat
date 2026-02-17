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
  status?: string;
  created_at?: string;
}

export interface ConversationState {
  chat_id: string;
  project_id: string;
  title: string;
  messages: MessageSummary[];
  compactions: CompactionSummary[];
  current_token_count: number;
  chat_instructions?: string;
  system_prompt_id?: string;
  chat_mode?: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  is_pinned?: boolean;
  is_archived?: boolean;
  chat_mode?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatCreateRequest {
  project_id: string;
  title: string;
  chat_instructions?: string;
  system_prompt_id?: string;
  chat_mode?: string;
}

export interface ChatCreateResponse {
  id: string;
  title: string;
  project_id: string;
  chat_instructions?: string;
  system_prompt_id?: string;
  chat_mode?: string;
  created_at?: string;
}

export interface ChatUpdateRequest {
  title?: string;
  is_pinned?: boolean;
  is_archived?: boolean;
  chat_instructions?: string;
  system_prompt_id?: string;
  chat_mode?: string;
}

export interface ChatUpdateResponse {
  id: string;
  title: string;
  project_id: string;
  is_pinned: boolean;
  is_archived: boolean;
  chat_instructions?: string;
  system_prompt_id?: string;
  chat_mode?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectContext {
  project_id: string;
  user_id: string;
  name: string;
  path: string;
  type?: string;
  template_id?: string;
  system_prompt_id?: string;
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
  default_num_ctx?: number;
  email_notifications?: boolean;
  in_app_notifications?: boolean;

  // Image generation defaults
  imggen_default_workflow?: string;
  imggen_default_width?: number;
  imggen_default_height?: number;
  imggen_default_steps?: number;
  imggen_default_cfg_scale?: number;
  imggen_default_prompt?: string;
  imggen_system_prompt?: string;
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
  default_num_ctx?: number;
  email_notifications?: boolean;
  in_app_notifications?: boolean;

  // Image generation defaults
  imggen_default_workflow?: string;
  imggen_default_width?: number;
  imggen_default_height?: number;
  imggen_default_steps?: number;
  imggen_default_cfg_scale?: number;
  imggen_default_prompt?: string;
  imggen_system_prompt?: string;
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
  action_ids?: string[];
  token_count?: number;
  max_tokens?: number;
  usage_ratio?: number;
  chat_title?: string;
}

export interface StreamErrorEvent {
  type: "error";
  message: string;
}

export interface StreamToolCallEvent {
  type: "tool_call";
  call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  iteration: number;
}

export interface StreamToolResultEvent {
  type: "tool_result";
  call_id: string;
  tool_name: string;
  success?: boolean;
  status?: string; // "pending_approval" | "denied" | "timed_out"
  duration_ms?: number;
  result_preview?: string;
}

export interface StreamToolApprovalRequiredEvent {
  type: "tool_approval_required";
  call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export type StreamEvent =
  | StreamTokenEvent
  | StreamDoneEvent
  | StreamErrorEvent
  | StreamToolCallEvent
  | StreamToolResultEvent
  | StreamToolApprovalRequiredEvent;

export interface SandboxChatResponse {
  chat_id: string;
  conversation: ConversationState;
}

export interface SidecarServiceInfo {
  name: string;
  image: string;
  exposed_ports: number[];
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  docker_image?: string;
  exposed_ports: number[];
  sidecar_services: SidecarServiceInfo[];
  memory_limit: string;
  cpu_quota: number;
}

export interface TemplateListResponse {
  templates: TemplateInfo[];
  categories: string[];
  count: number;
}

// Technologies
export interface TechnologyInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  requires_technologies: string[];
  conflicts_with: string[];
  exposed_ports: number[];
  sidecar_services: SidecarServiceInfo[];
}

export interface TechnologyCategoryGroup {
  category: string;
  technologies: TechnologyInfo[];
}

export interface TechnologyListResponse {
  groups: TechnologyCategoryGroup[];
  categories: string[];
  count: number;
}

// UI Components
export interface UIComponentInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  is_framework_specific: boolean;
  framework?: string;
  html_template: string;
  framework_code?: string;
  props_schema: Record<string, unknown>;
  preview_image?: string;
  tags: string[];
  is_mobile_responsive: boolean;
  created_at?: string;
}

export interface UIComponentListResponse {
  components: UIComponentInfo[];
  categories: string[];
  count: number;
}

export interface UIComponentCreateRequest {
  name: string;
  category: string;
  description: string;
  is_framework_specific?: boolean;
  framework?: string;
  html_template: string;
  framework_code?: string;
  props_schema?: Record<string, unknown>;
  preview_image?: string;
  tags?: string[];
  is_mobile_responsive?: boolean;
}

export interface UIComponentUpdateRequest {
  name?: string;
  category?: string;
  description?: string;
  is_framework_specific?: boolean;
  framework?: string;
  html_template?: string;
  framework_code?: string;
  props_schema?: Record<string, unknown>;
  preview_image?: string;
  tags?: string[];
  is_mobile_responsive?: boolean;
}

// Docker Export
export interface DockerExportRequest {
  image_name?: string;
  include_compose?: boolean;
  include_tar?: boolean;
}

export interface DockerExportResponse {
  image_id: string;
  image_name: string;
  compose_file?: string;
  tar_download_url?: string;
}

export interface ProjectCreateRequest {
  name: string;
  path: string;
  type?: string;
  template_id?: string;
  selected_technologies?: string[];
  settings?: Record<string, unknown>;
  custom_context?: string;
  important_files?: string[];
}

export interface ProjectCreateResponse {
  id: string;
  name: string;
  path: string;
  type?: string;
  template_id?: string;
  selected_technologies?: string[];
  created_at?: string;
}

export interface ProjectUpdateRequest {
  name?: string;
  path?: string;
  type?: string;
  template_id?: string;
  system_prompt_id?: string;
  settings?: Record<string, unknown>;
  custom_context?: string;
  important_files?: string[];
}

export interface ProjectUpdateResponse {
  id: string;
  name: string;
  path: string;
  type?: string;
  system_prompt_id?: string;
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
  template_id?: string;
  selected_technologies?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
  count: number;
}

// System Prompts
export interface SystemPrompt {
  id: string;
  name: string;
  content: string;
  description?: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SystemPromptCreateRequest {
  name: string;
  content: string;
  description?: string;
  is_default?: boolean;
}

export interface SystemPromptUpdateRequest {
  name?: string;
  content?: string;
  description?: string;
  is_default?: boolean;
}

export interface SystemPromptListResponse {
  prompts: SystemPrompt[];
  count: number;
}

// Message Actions
export interface MessageUpdateRequest {
  content?: string;
  is_pinned?: boolean;
  is_excluded?: boolean;
}

export interface MessageUpdateResponse {
  id: string;
  role: string;
  content: string;
  is_pinned: boolean;
  is_excluded: boolean;
  updated_at?: string;
}

// Token Breakdown
export interface TokenBreakdownResponse {
  system_prompt_tokens: number;
  project_context_tokens: number;
  chat_instructions_tokens: number;
  kb_results_tokens: number;
  compaction_summary_tokens: number;
  conversation_tokens: number;
  total: number;
  context_window: number;
  fill_ratio: number;
  message_count: number;
  excluded_count: number;
  pinned_count: number;
}

// Assembled Context
export interface AssembledContextLayer {
  name: string;
  role: string;
  content: string;
  tokens: number;
}

export interface AssembledContextResponse {
  layers: AssembledContextLayer[];
  total_tokens: number;
  context_window: number;
  fill_ratio: number;
  model_name: string;
}

// Context Edit Requests
export interface CompactionUpdateRequest {
  summary: string;
}

export interface ChatInstructionsUpdateRequest {
  chat_instructions: string;
}

// Context Snippets
export interface ContextSnippet {
  id: string;
  name: string;
  content: string;
  description?: string;
  tags: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ContextSnippetCreateRequest {
  name: string;
  content: string;
  description?: string;
  tags?: string[];
}

export interface ContextSnippetUpdateRequest {
  name?: string;
  content?: string;
  description?: string;
  tags?: string[];
}

export interface ContextSnippetListResponse {
  snippets: ContextSnippet[];
  count: number;
}

// Tokenization
export interface TokenSpan {
  text: string;
  start: number;
  end: number;
}

export interface TokenizeResponse {
  tokens: TokenSpan[];
  total: number;
  characters: number;
  chars_per_token: number;
}

// Compaction Status
export interface CompactionStatusResponse {
  id: string;
  status: string;
  original_message_count: number;
  compacted_message_count: number;
  summary?: string;
  created_at?: string;
}
