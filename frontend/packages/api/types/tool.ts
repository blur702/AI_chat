export interface ToolInfo {
  name: string;
  description: string;
  parameters_schema: Record<string, unknown>;
  required_permissions: string[];
}

export interface ToolListResponse {
  tools: ToolInfo[];
  count: number;
}

export interface ToolExecuteRequest {
  tool_name: string;
  parameters: Record<string, unknown>;
  use_cache?: boolean;
  chat_id?: string;
  context_data?: Record<string, unknown>;
}

export interface ToolExecuteResponse {
  tool: string;
  success: boolean;
  result: Record<string, unknown> | null;
  error: string | null;
  cached: boolean;
  duration_ms: number;
  conversation_context: Record<string, unknown> | null;
}

export interface CacheClearRequest {
  tool_name?: string;
}

export interface CacheClearResponse {
  deleted_count: number;
  tool_name: string | null;
}
