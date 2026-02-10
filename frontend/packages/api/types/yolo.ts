export interface YoloEdit {
  id: string;
  project_id: string;
  chat_id?: string;
  files_modified: string[];
  undo_performed: boolean;
  created_at: string;
  updated_at: string;
  undo_data?: Record<string, any>;
}

export interface YoloEditListResponse {
  edits: YoloEdit[];
  count: number;
}

export interface YoloEditUndoResponse {
  id: string;
  status: string;
  files_restored: string[];
}
