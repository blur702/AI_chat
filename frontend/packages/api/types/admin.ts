export interface ServiceDebugInfo {
  service_name: string;
  is_running: boolean;
  health_status: boolean;
  health_message: string;
  internal_state: Record<string, unknown>;
  metrics: Record<string, unknown>;
}

export interface KernelDebugInfo {
  kernel_info: Record<string, unknown>;
  services: Record<string, ServiceDebugInfo>;
  redis_info: Record<string, unknown>;
  database_info: Record<string, unknown>;
  timestamp: string;
}

export interface KernelMetrics {
  uptime_seconds: number | null;
  registered_service_count: number;
  healthy_service_count: number;
  total_subscriber_count: number;
  total_registered_tools: number;
  active_conversations: number;
  active_queue_processors: number;
  redis_memory_bytes: number | null;
  queue_size: number;
  timestamp: string;
}

// User Management (Admin)

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  screen_name: string | null;
  email_verified: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  last_password_change: string | null;
  created_at: string;
  updated_at: string | null;
  is_master: boolean;
}

export interface AdminUserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminUserListParams {
  search?: string;
  role?: string;
  is_active?: boolean;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface AdminUserUpdateRequest {
  role?: string;
  is_active?: boolean;
  first_name?: string;
  last_name?: string;
  screen_name?: string;
  email?: string;
}

export interface AdminUserUpdateResponse {
  user: AdminUser;
  message: string;
}

export interface UserUnlockResponse {
  user_id: string;
  username: string;
  message: string;
  unlocked_at: string;
}

// Audit Logs

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  resource: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogListResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditLogFilters {
  user_id?: string;
  action?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  ip_address?: string;
  search?: string;
  sort_by?: string;
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}
