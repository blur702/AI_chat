/** Types for the Traycer-style planning system. */

export interface PlanTask {
  id: string;
  phase_id: string;
  title: string;
  description: string;
  task_order: number;
  task_type: string;
  task_data: Record<string, unknown> | null;
  depends_on: string[] | null;
  status: "pending" | "ready" | "in_progress" | "completed" | "failed";
  result: Record<string, unknown> | null;
  automation_action_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanPhase {
  id: string;
  session_id: string;
  title: string;
  description: string;
  phase_order: number;
  inputs: string[] | null;
  outputs: string[] | null;
  implementation_plan: Record<string, unknown> | null;
  verification_checks: Array<{ type: string; criteria: string }> | null;
  status: "pending" | "in_progress" | "verifying" | "completed" | "failed";
  user_approved: boolean;
  verification_result: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  tasks: PlanTask[];
  created_at: string;
  updated_at: string;
}

export interface PlanningSession {
  id: string;
  project_id: string;
  chat_id: string | null;
  user_id: string;
  title: string;
  description: string | null;
  target_type: "sandbox" | "ui_builder" | "both";
  status: "draft" | "active" | "in_progress" | "completed" | "archived";
  current_phase_id: string | null;
  success_criteria: string[] | null;
  phase_count: number;
  completed_phase_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlanningSessionDetail extends PlanningSession {
  phases: PlanPhase[];
  ui_builder_state: Record<string, unknown> | null;
}

export interface PlanProgress {
  session_id: string;
  status: string;
  total_phases: number;
  completed_phases: number;
  current_phase_title: string | null;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
}

export interface PlanningSessionCreateRequest {
  project_id: string;
  chat_id?: string;
  title: string;
  description?: string;
  target_type?: "sandbox" | "ui_builder" | "both";
  success_criteria?: string[];
}

export interface PlanPhaseCreateRequest {
  title: string;
  description?: string;
  inputs?: string[];
  outputs?: string[];
  implementation_plan?: Record<string, unknown>;
  verification_checks?: Array<{ type: string; criteria: string }>;
}

export interface PlanTaskCreateRequest {
  title: string;
  description?: string;
  task_type: string;
  task_data?: Record<string, unknown>;
  depends_on?: string[];
}
