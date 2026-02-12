// -------------------------------------------------------------------------
// Git Import
// -------------------------------------------------------------------------

export interface GitImportRequest {
  name: string;
  git_url: string;
  branch?: string;
  install_deps?: boolean;
  path?: string;
}

export interface GitImportResponse {
  import_id: string;
  project_id: string;
  status: string;
  message: string;
}

// -------------------------------------------------------------------------
// Archive Upload
// -------------------------------------------------------------------------

export interface ArchiveUploadResponse {
  import_id: string;
  project_id: string;
  status: string;
  message: string;
}

// -------------------------------------------------------------------------
// Import Status
// -------------------------------------------------------------------------

export interface ImportStatusResponse {
  import_id: string;
  project_id: string;
  import_type: string;
  source_url?: string;
  status: string;
  detected_type?: string;
  detected_template_id?: string;
  progress_message?: string;
  error_message?: string;
  import_options: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

// -------------------------------------------------------------------------
// Clone
// -------------------------------------------------------------------------

export interface CloneProjectRequest {
  name: string;
  path?: string;
}

export interface CloneProjectResponse {
  project_id: string;
  name: string;
  message: string;
}

// -------------------------------------------------------------------------
// Snapshots
// -------------------------------------------------------------------------

export interface SnapshotCreateRequest {
  name: string;
}

export interface SnapshotInfo {
  name: string;
  image_id: string;
  created_at?: string;
  size?: number;
}

export interface SnapshotListResponse {
  project_id: string;
  snapshots: SnapshotInfo[];
}

export interface SnapshotRestoreResponse {
  project_id: string;
  snapshot_name: string;
  container_id: string;
  message: string;
}

// -------------------------------------------------------------------------
// Detection
// -------------------------------------------------------------------------

export interface DetectionResultResponse {
  project_type: string;
  framework?: string;
  suggested_template_id?: string;
  confidence: number;
}
