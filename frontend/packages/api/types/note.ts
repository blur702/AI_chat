// ---- Note Category Types ----

export interface NoteCategoryCreateRequest {
  name: string;
  color?: string | null;
  sort_order?: number;
}

export interface NoteCategoryUpdateRequest {
  name?: string;
  color?: string | null;
  sort_order?: number;
}

export interface NoteCategoryResponse {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  is_system: boolean;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface NoteCategoryListResponse {
  categories: NoteCategoryResponse[];
  count: number;
}

// ---- Note Types ----

export interface NoteCreateRequest {
  title?: string | null;
  body: string;
  project_id?: string | null;
  category_id?: string | null;
  pinned?: boolean;
  generate_title?: boolean;
}

export interface NoteUpdateRequest {
  title?: string | null;
  body?: string | null;
  project_id?: string | null;
  category_id?: string | null;
  status?: "active" | "completed" | "archived";
  pinned?: boolean;
}

export interface NoteResponse {
  id: string;
  title?: string | null;
  body: string;
  status: "active" | "completed" | "archived";
  pinned: boolean;
  project_id?: string | null;
  project_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  issue_id?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface NoteListResponse {
  notes: NoteResponse[];
  count: number;
}
