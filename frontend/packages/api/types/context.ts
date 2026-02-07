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
  created_at?: string;
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
