export interface AutomationAction {
  id: string;
  project_id: string;
  action_type: string;
  action_data?: Record<string, unknown>;
  user_approved: boolean;
  executed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationActionListResponse {
  actions: AutomationAction[];
  count: number;
}

export interface AutomationActionExecuteResponse {
  id: string;
  status: string;
  result?: Record<string, unknown>;
  executed_at?: string;
}
