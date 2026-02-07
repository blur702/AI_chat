export interface ServiceDebug {
  service_name: string;
  is_running: boolean;
  health_status: boolean;
  health_message: string;
  internal_state: Record<string, unknown>;
  metrics: Record<string, unknown>;
}

export interface KernelDebug {
  kernel_info: Record<string, unknown>;
  services: Record<string, ServiceDebug>;
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
