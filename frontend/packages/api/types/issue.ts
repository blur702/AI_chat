// ---- Issue Types ----

export interface IssueCreateRequest {
  project_id?: string | null;
  title: string;
  description?: string | null;
  severity?: "low" | "medium" | "high" | "critical";
  reproduction_steps?: string | null;
  note_id?: string | null;
  is_app_issue?: boolean;
}

export interface IssueUpdateRequest {
  title?: string;
  description?: string | null;
  severity?: "low" | "medium" | "high" | "critical";
  status?: "open" | "in_progress" | "fix_pending_review" | "resolved" | "closed";
  reproduction_steps?: string | null;
  fix_branch?: string | null;
  fix_pr_url?: string | null;
  coderabbit_review_url?: string | null;
  is_app_issue?: boolean;
}

export interface IssueResponse {
  id: string;
  project_id?: string | null;
  project_name?: string | null;
  is_app_issue?: boolean;
  note_id?: string | null;
  title: string;
  description?: string | null;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "fix_pending_review" | "resolved" | "closed";
  reproduction_steps?: string | null;
  fix_branch?: string | null;
  fix_pr_url?: string | null;
  coderabbit_review_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface IssueListResponse {
  issues: IssueResponse[];
  count: number;
}

export interface StartFixResponse {
  issue_id: string;
  branch: string;
  message: string;
}
