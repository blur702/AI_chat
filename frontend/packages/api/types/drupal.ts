export interface DrupalConnectRequest {
  site_url: string;
  api_key: string;
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
