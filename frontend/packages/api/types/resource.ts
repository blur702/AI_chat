export type ResourceStatus =
  | "active"
  | "loading"
  | "loaded"
  | "unloading"
  | "cpu_offloaded"
  | "error";

export type OffloadPreference =
  | "always_offload"
  | "always_cancel"
  | "ask_each_time";

export type OffloadDecision = "offload" | "cancel";

export interface VRAMStats {
  total_mb: number;
  used_mb: number;
  free_mb: number;
  utilization_percent: number;
  gpu_count: number;
}

export interface Resource {
  resource_id: string;
  resource_type: string;
  status: ResourceStatus;
  vram_mb: number | null;
  user_locked: boolean;
  priority: number;
  last_used_at: string | null;
}

export interface PreemptionCheckRequest {
  required_vram_mb: number;
}

export interface PreemptionCheckResponse {
  available: boolean;
  free_vram_mb: number;
  preemptable_resources: string[];
}

export interface OffloadDecisionRequest {
  resource_id: string;
  user_id: string;
  decision: OffloadDecision;
  remember: boolean;
}

export interface OffloadDecisionResponse {
  success: boolean;
  message: string;
  preempted_resources: string[] | null;
}

export interface ReloadRequest {
  resource_id: string;
  estimated_vram_mb: number;
  user_id?: string;
}

export interface PreferenceRequest {
  user_id: string;
  preference: OffloadPreference;
  remember: boolean;
}

export interface PreferenceResponse {
  preference: OffloadPreference;
}

export interface OperationStateRequest {
  operation_id: string;
  operation_type: string;
  resource_id: string;
  user_id: string;
  metadata: Record<string, unknown>;
}

export interface OperationStateResponse {
  operation_id: string;
  found: boolean;
  state: Record<string, unknown> | null;
}

export interface SystemStats {
  cpu_percent: number;
  ram_total_mb: number;
  ram_used_mb: number;
  ram_free_mb: number;
  ram_percent: number;
}

export interface ResourceStatusResponse {
  vram_stats: VRAMStats;
  system_stats: SystemStats | null;
  loaded_resources: Resource[];
  queue_size: number;
  active_operations_count: number;
  timestamp: string;
}

export interface ActiveOperation {
  operation_id: string;
  operation_type: string | null;
  resource_id: string | null;
  user_id: string | null;
  status: string | null;
  started_at: string | null;
  metadata: Record<string, unknown>;
}

export interface OperationListResponse {
  operations: ActiveOperation[];
  total_count: number;
  timestamp: string;
}
