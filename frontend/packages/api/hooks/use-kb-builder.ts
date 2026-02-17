"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { getClient } from "../client";
import type {
  KBBulkUploadFileInfo,
  KBChunkPreviewResponse,
  KBExtractPreviewResponse,
  KBEmbeddingModelInfo,
  KBBulkStatusResponse,
  ImageProcessingMethod,
} from "../types/kb";

export interface ChunkSettings {
  chunk_size: number;
  chunk_overlap: number;
  separators?: string[];
}

export interface UseKBBuilderReturn {
  // Step 1: Files
  files: KBBulkUploadFileInfo[];
  addFiles: (newFiles: File[]) => Promise<void>;
  removeFile: (fileId: string) => void;
  uploading: boolean;
  rawFiles: Map<string, File>;

  // Step 2: Extraction
  extractions: Record<string, KBExtractPreviewResponse>;
  extractPreview: (fileId: string, method?: ImageProcessingMethod) => Promise<void>;
  extracting: boolean;
  imageProcessing: Record<string, ImageProcessingMethod>;
  setImageProcessing: (fileId: string, method: ImageProcessingMethod) => void;

  // Step 3: Chunking
  chunkSettings: ChunkSettings;
  setChunkSettings: (settings: ChunkSettings) => void;
  chunkPreview: (text: string) => Promise<void>;
  chunkPreviewResult: KBChunkPreviewResponse | null;
  chunking: boolean;

  // Step 4: Embedding
  embeddingModels: KBEmbeddingModelInfo[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  loadModels: () => Promise<void>;
  loadingModels: boolean;

  // Step 5: Build
  scope: "project" | "global";
  setScope: (scope: "project" | "global") => void;
  startBuild: (projectId?: string) => Promise<void>;
  batchStatus: KBBulkStatusResponse | null;
  building: boolean;
  pollStatus: () => Promise<void>;

  // General
  error: string | null;
  reset: () => void;
}

/**
 * Orchestrates the multi-step knowledge base build wizard: file upload, extraction, chunking, embedding model selection, and batch ingestion.
 * @returns Per-step state and functions, batch build status, polling controls, and a full `reset` function.
 */
export function useKBBuilder(): UseKBBuilderReturn {
  // Step 1
  const [files, setFiles] = useState<KBBulkUploadFileInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const rawFilesRef = useRef<Map<string, File>>(new Map());

  // Step 2
  const [extractions, setExtractions] = useState<Record<string, KBExtractPreviewResponse>>({});
  const [extracting, setExtracting] = useState(false);
  const [imageProcessing, setImageProcessingState] = useState<Record<string, ImageProcessingMethod>>({});

  // Step 3
  const [chunkSettings, setChunkSettings] = useState<ChunkSettings>({
    chunk_size: 500,
    chunk_overlap: 50,
  });
  const [chunkPreviewResult, setChunkPreviewResult] = useState<KBChunkPreviewResponse | null>(null);
  const [chunking, setChunking] = useState(false);

  // Step 4
  const [embeddingModels, setEmbeddingModels] = useState<KBEmbeddingModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("nomic-embed-text");
  const [loadingModels, setLoadingModels] = useState(false);

  // Step 5
  const [scope, setScope] = useState<"project" | "global">("project");
  const [batchStatus, setBatchStatus] = useState<KBBulkStatusResponse | null>(null);
  const [building, setBuilding] = useState(false);
  const batchIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // General
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback(async (newFiles: File[]) => {
    setUploading(true);
    setError(null);
    try {
      const result = await getClient().bulkUploadKB(newFiles);
      // Map file_ids to raw Files by upload order to handle duplicate filenames.
      for (const [index, info] of result.files.entries()) {
        const matchingFile = newFiles[index];
        if (matchingFile) {
          rawFilesRef.current.set(info.file_id, matchingFile);
        }
      }
      setFiles((prev) => [...prev, ...result.files]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.file_id !== fileId));
    rawFilesRef.current.delete(fileId);
    setExtractions((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
  }, []);

  const extractPreview = useCallback(async (fileId: string, method?: ImageProcessingMethod) => {
    setExtracting(true);
    setError(null);
    try {
      const rawFile = rawFilesRef.current.get(fileId);
      if (!rawFile) throw new Error("Original file not found for extraction");
      const result = await getClient().extractPreviewKB(
        rawFile,
        method === "skip" ? undefined : method,
      );
      setExtractions((prev) => ({ ...prev, [fileId]: result }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }, []);

  const setImageProcessing = useCallback((fileId: string, method: ImageProcessingMethod) => {
    setImageProcessingState((prev) => ({ ...prev, [fileId]: method }));
  }, []);

  const chunkPreview = useCallback(async (text: string) => {
    setChunking(true);
    setError(null);
    try {
      const result = await getClient().chunkPreviewKB({
        text,
        chunk_size: chunkSettings.chunk_size,
        chunk_overlap: chunkSettings.chunk_overlap,
        separators: chunkSettings.separators,
      });
      setChunkPreviewResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Chunk preview failed");
    } finally {
      setChunking(false);
    }
  }, [chunkSettings]);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const result = await getClient().listEmbeddingModels();
      setEmbeddingModels(result.models);
      if (result.models.length > 0 && !result.models.find((m) => m.name === selectedModel)) {
        setSelectedModel(result.models[0].name);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoadingModels(false);
    }
  }, [selectedModel]);

  const pollFailuresRef = useRef(0);
  const MAX_POLL_FAILURES = 5;

  const pollStatus = useCallback(async () => {
    if (!batchIdRef.current) return;
    try {
      const result = await getClient().getBulkStatus(batchIdRef.current);
      pollFailuresRef.current = 0;
      setBatchStatus(result);
      if (result.status === "completed" || result.status === "completed_with_errors" || result.status === "failed") {
        setBuilding(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch {
      pollFailuresRef.current += 1;
      if (pollFailuresRef.current >= MAX_POLL_FAILURES) {
        setBuilding(false);
        setError(`Lost connection to build status after ${MAX_POLL_FAILURES} consecutive failures`);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    }
  }, []);

  const startBuild = useCallback(async (projectId?: string) => {
    setBuilding(true);
    setError(null);
    try {
      const result = await getClient().bulkIngestKB({
        project_id: scope === "project" ? projectId : null,
        file_ids: files.map((f) => f.file_id),
        chunk_size: chunkSettings.chunk_size,
        chunk_overlap: chunkSettings.chunk_overlap,
        embedding_model: selectedModel,
        image_processing: Object.keys(imageProcessing).length > 0 ? imageProcessing : undefined,
        scope,
      });
      batchIdRef.current = result.batch_id;
      setBatchStatus({
        batch_id: result.batch_id,
        status: result.status,
        total_files: result.total_files,
        files_completed: 0,
        files_failed: 0,
        total_chunks: 0,
        chunks_embedded: 0,
        file_statuses: [],
      });

      // Start polling
      pollIntervalRef.current = setInterval(pollStatus, 2000);
    } catch (err: unknown) {
      setBuilding(false);
      setError(err instanceof Error ? err.message : "Build failed to start");
    }
  }, [files, chunkSettings, selectedModel, imageProcessing, scope, pollStatus]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const reset = useCallback(() => {
    setFiles([]);
    rawFilesRef.current.clear();
    setExtractions({});
    setImageProcessingState({});
    setChunkSettings({ chunk_size: 500, chunk_overlap: 50 });
    setChunkPreviewResult(null);
    setEmbeddingModels([]);
    setSelectedModel("nomic-embed-text");
    setScope("project");
    setBatchStatus(null);
    setBuilding(false);
    setError(null);
    batchIdRef.current = null;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  return {
    files, addFiles, removeFile, uploading,
    rawFiles: rawFilesRef.current,
    extractions, extractPreview, extracting,
    imageProcessing, setImageProcessing,
    chunkSettings, setChunkSettings, chunkPreview, chunkPreviewResult, chunking,
    embeddingModels, selectedModel, setSelectedModel, loadModels, loadingModels,
    scope, setScope, startBuild, batchStatus, building, pollStatus,
    error, reset,
  };
}
