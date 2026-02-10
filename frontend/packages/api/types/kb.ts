export type KBSourceStatus = "pending" | "processing" | "completed" | "failed";

export type KBSourceType = "pdf" | "text" | "markdown";

export interface KBSource {
  id: string;
  project_id: string;
  source_type: KBSourceType;
  source_path: string;
  status: KBSourceStatus;
  chunk_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface KBSourceListResponse {
  sources: KBSource[];
  count: number;
}

export interface KBChunk {
  id: string;
  source_id: string;
  content: string;
  chunk_index: number;
  metadata?: Record<string, unknown> | null;
  has_embedding: boolean;
  similarity?: number | null;
}

export interface KBChunkListResponse {
  chunks: KBChunk[];
  total: number;
}

export interface KBSearchRequest {
  project_id: string;
  query: string;
  top_k?: number;
  model?: string;
}

export interface KBSearchResult {
  chunk_id: string;
  source_id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown> | null;
}

export interface KBSearchResponse {
  results: KBSearchResult[];
  query: string;
  count: number;
}
