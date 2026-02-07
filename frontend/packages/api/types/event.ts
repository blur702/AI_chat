export type EventType =
  | "model_loaded"
  | "model_unloaded"
  | "tool_executed"
  | "resource_updated"
  | "resource_created"
  | "resource_deleted"
  | "error"
  | "system"
  | "user_action"
  | "chat_message"
  | "kernel_startup"
  | "kernel_shutdown"
  | "service_health_changed";

export type EventSeverity = "info" | "warning" | "error" | "critical";

export interface EventCreate {
  event_type: string;
  event_data: Record<string, unknown>;
  severity?: EventSeverity;
  source: string;
  user_id?: string;
  chat_id?: string;
  resource_id?: string;
  persist?: boolean;
}

export interface EventResponse {
  id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  severity: string;
  source: string;
  user_id: string | null;
  chat_id: string | null;
  resource_id: string | null;
  created_at: string;
}

export interface EventListResponse {
  events: EventResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface WebSocketMessage {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}
