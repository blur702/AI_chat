export interface DrupalConnectRequest {
  site_url: string;
  username: string;
  password: string;
  site_name?: string;
}

export interface DrupalConnectResponse {
  id: string;
  project_id: string;
  site_url: string;
  site_name?: string;
  connected: boolean;
  message: string;
}

export interface DrupalSiteInfo {
  id: string;
  project_id: string;
  site_url: string;
  site_name?: string;
  last_sync_at?: string;
  sync_config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DrupalSiteConfig {
  drupal_version?: string;
  content_types: string[];
  modules: string[];
  themes: string[];
  site_name?: string;
  error?: string;
}

export interface DrushCommandRequest {
  command: string;
}

export interface DrushCommandResponse {
  command: string;
  output: string;
  exit_code: number;
  error?: string;
}

export interface SyncStatus {
  connected: boolean;
  last_sync_at?: string;
  site_url?: string;
  site_name?: string;
}

export interface SyncResponse {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// --- Content CRUD ---

export interface DrupalContentType {
  id: string;
  label: string;
  description?: string;
}

export interface DrupalNode {
  uuid: string;
  title: string;
  bundle: string;
  status: boolean;
  created?: string;
  changed?: string;
  body?: string;
  body_format?: string;
}

export interface DrupalNodeListResponse {
  nodes: DrupalNode[];
  total?: number;
}

export interface DrupalNodeCreateRequest {
  title: string;
  body?: string;
  body_format?: string;
  status?: boolean;
}

export interface DrupalNodeUpdateRequest {
  title?: string;
  body?: string;
  body_format?: string;
  status?: boolean;
}

// --- Staging / Clone / Push ---

export interface StagingStatus {
  sandbox_running: boolean;
  container_id?: string;
  preview_url?: string;
  last_clone_at?: string;
  site_url?: string;
  site_name?: string;
}

export interface CloneRequest {
  include_files?: boolean;
  include_db?: boolean;
}

export interface CloneResponse {
  success: boolean;
  message: string;
  preview_url?: string;
  details?: Record<string, unknown>;
}

export interface PushRequest {
  include_files?: boolean;
  include_db?: boolean;
  confirm: boolean;
}

export interface PushResponse {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}
