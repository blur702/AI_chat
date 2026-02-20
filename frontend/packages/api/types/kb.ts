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

// KB Builder Wizard types

export type ImageProcessingMethod = "ocr" | "vision" | "skip";

export interface KBBulkUploadFileInfo {
  file_id: string;
  filename: string;
  size: number;
  type: string;
}

export interface KBBulkUploadResponse {
  files: KBBulkUploadFileInfo[];
}

export interface KBExtractPreviewResponse {
  filename: string;
  source_type: string;
  extracted_text: string;
  char_count: number;
  extraction_method: string;
}

export interface KBChunkPreviewRequest {
  text: string;
  chunk_size: number;
  chunk_overlap: number;
  separators?: string[];
}

export interface KBChunkPreviewItem {
  content: string;
  index: number;
  char_count: number;
}

export interface KBChunkPreviewResponse {
  chunks: KBChunkPreviewItem[];
  total_chunks: number;
  avg_chunk_size: number;
}

export interface KBEmbeddingModelInfo {
  name: string;
  size?: string | null;
  parameter_size?: string | null;
  embedding_length?: number | null;
}

export interface KBEmbeddingModelsResponse {
  models: KBEmbeddingModelInfo[];
}

export interface KBBulkIngestRequest {
  project_id?: string | null;
  file_ids: string[];
  chunk_size: number;
  chunk_overlap: number;
  embedding_model: string;
  image_processing?: Record<string, ImageProcessingMethod>;
  scope: "project" | "global";
}

export interface KBBulkIngestResponse {
  batch_id: string;
  total_files: number;
  status: string;
}

export interface KBBulkFileStatus {
  file_id: string;
  filename: string;
  status: string;
  chunks: number;
  error?: string | null;
}

export interface KBBulkStatusResponse {
  batch_id: string;
  status: string;
  total_files: number;
  files_completed: number;
  files_failed: number;
  total_chunks: number;
  chunks_embedded: number;
  file_statuses: KBBulkFileStatus[];
}
