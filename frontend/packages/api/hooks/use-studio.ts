"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getClient } from "../client";
import { extractErrorMessage } from "../utils/error";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface StudioProject {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  timeline_data: any;
  settings: Record<string, any>;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface MediaAsset {
  id: string;
  user_id: string;
  video_project_id: string;
  filename: string;
  media_type: string; // "video" | "audio" | "image"
  mime_type: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  thumbnail_path: string | null;
  metadata: Record<string, any> | null;
  created_at: string | null;
}

export interface VideoExportStatus {
  id: string;
  video_project_id: string;
  user_id: string;
  status: string;
  format: string;
  resolution: string | null;
  file_size_bytes: number | null;
  progress_percent: number;
  error_message: string | null;
  export_settings: Record<string, any> | null;
  created_at: string | null;
  updated_at: string | null;
}

// Request / input shapes

export interface StudioProjectCreateRequest {
  name: string;
  description?: string | null;
  timeline_data?: any;
  settings?: Record<string, any>;
}

export interface StudioProjectUpdateRequest {
  name?: string;
  description?: string | null;
  timeline_data?: any;
  settings?: Record<string, any>;
  thumbnail_path?: string | null;
  duration_seconds?: number | null;
  status?: string;
}

export interface ExportStartRequest {
  format?: string;
  resolution?: string;
  export_settings?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Internal helper – multipart upload via fetch (rawFetch is private on client)
// ---------------------------------------------------------------------------

async function uploadFormData<T>(path: string, formData: FormData): Promise<T> {
  const baseUrl = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL ?? "") : "";

  // Retrieve token from the singleton client's token storage.
  // The client stores the token in memory; we read it from localStorage as a
  // fallback since the client only exposes setToken(), not getToken().
  let token: string | null = null;
  if (typeof window !== "undefined") {
    token = localStorage.getItem("auth_token");
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Upload failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// useStudioProjects — list, create, delete video projects
// ---------------------------------------------------------------------------

/**
 * Manages the authenticated user's list of Video Studio projects.
 *
 * @returns Project list, loading/error state, and CRUD mutations.
 *
 * @example
 * const { projects, createProject, deleteProject } = useStudioProjects();
 */
export function useStudioProjects() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await getClient().get<{ projects: StudioProject[] }>("/api/studio/projects");
      setProjects(data.projects ?? (data as any));
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load studio projects"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProject = useCallback(
    async (data: StudioProjectCreateRequest): Promise<StudioProject> => {
      try {
        setError(null);
        const { data: project } = await getClient().post<StudioProject>(
          "/api/studio/projects",
          data,
        );
        await refresh();
        return project;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to create studio project"));
        throw err;
      }
    },
    [refresh],
  );

  const deleteProject = useCallback(async (projectId: string): Promise<void> => {
    try {
      setError(null);
      await getClient().delete(`/api/studio/projects/${encodeURIComponent(projectId)}`);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete studio project"));
      throw err;
    }
  }, []);

  return {
    projects,
    loading,
    error,
    refresh,
    createProject,
    deleteProject,
  };
}

// ---------------------------------------------------------------------------
// useStudioProject — get and update a single project (timeline + metadata)
// ---------------------------------------------------------------------------

/**
 * Fetches and manages a single Video Studio project, including its full
 * timeline JSON.
 *
 * @param projectId - The UUID of the studio project to manage.
 *
 * @example
 * const { project, updateProject } = useStudioProject(id);
 */
export function useStudioProject(projectId: string) {
  const [project, setProject] = useState<StudioProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const { data } = await getClient().get<StudioProject>(
        `/api/studio/projects/${encodeURIComponent(projectId)}`,
      );
      setProject(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load studio project"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateProject = useCallback(
    async (updates: StudioProjectUpdateRequest): Promise<StudioProject> => {
      try {
        setError(null);
        const { data } = await getClient().put<StudioProject>(
          `/api/studio/projects/${encodeURIComponent(projectId)}`,
          updates,
        );
        setProject(data);
        return data;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to update studio project"));
        throw err;
      }
    },
    [projectId],
  );

  /**
   * Convenience wrapper: persist the timeline JSON without touching other
   * project metadata.
   */
  const saveTimeline = useCallback(
    async (timelineData: any): Promise<StudioProject> => {
      return updateProject({ timeline_data: timelineData });
    },
    [updateProject],
  );

  return {
    project,
    loading,
    error,
    refresh,
    updateProject,
    saveTimeline,
  };
}

// ---------------------------------------------------------------------------
// useStudioMedia — list, upload, delete media assets for a project
// ---------------------------------------------------------------------------

/**
 * Manages the media assets (video, audio, image clips) attached to a single
 * Video Studio project.
 *
 * @param projectId - The UUID of the studio project whose assets to manage.
 *
 * @example
 * const { assets, uploadMedia, deleteAsset } = useStudioMedia(projectId);
 */
export function useStudioMedia(projectId: string) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const { data } = await getClient().get<{ assets: MediaAsset[] }>(
        `/api/studio/projects/${encodeURIComponent(projectId)}/media`,
      );
      setAssets(data.assets ?? (data as any));
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load project media"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Upload a media file (video, audio, or image) to the project.
   * Uses multipart/form-data since the endpoint expects a file upload.
   *
   * @param file - The File object to upload.
   * @param mediaType - Optional explicit media type override ("video" | "audio" | "image").
   */
  const uploadMedia = useCallback(
    async (file: File, mediaType?: "video" | "audio" | "image"): Promise<MediaAsset> => {
      try {
        setError(null);
        setUploading(true);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append("file", file);
        if (mediaType) {
          formData.append("media_type", mediaType);
        }

        const asset = await uploadFormData<MediaAsset>(
          `/api/studio/projects/${encodeURIComponent(projectId)}/media`,
          formData,
        );

        setUploadProgress(100);
        setAssets((prev) => [...prev, asset]);
        return asset;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to upload media"));
        throw err;
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [projectId],
  );

  /**
   * Upload a screen/camera recording captured from the browser.
   * Uses the dedicated recordings endpoint.
   *
   * @param file - The recording Blob or File.
   * @param filename - Optional filename to assign to the recording.
   */
  const uploadRecording = useCallback(
    async (file: File | Blob, filename = "recording.webm"): Promise<MediaAsset> => {
      try {
        setError(null);
        setUploading(true);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append(
          "file",
          file instanceof File ? file : new File([file], filename, { type: file.type }),
        );

        const asset = await uploadFormData<MediaAsset>(
          `/api/studio/projects/${encodeURIComponent(projectId)}/recordings`,
          formData,
        );

        setUploadProgress(100);
        setAssets((prev) => [...prev, asset]);
        return asset;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to upload recording"));
        throw err;
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [projectId],
  );

  /**
   * Permanently delete a media asset from the project.
   *
   * @param mediaId - The UUID of the asset to remove.
   */
  const deleteAsset = useCallback(async (mediaId: string): Promise<void> => {
    try {
      setError(null);
      await getClient().delete(`/api/studio/media/${encodeURIComponent(mediaId)}`);
      setAssets((prev) => prev.filter((a) => a.id !== mediaId));
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete media asset"));
      throw err;
    }
  }, []);

  /**
   * Build the authenticated URL for streaming or downloading a media file.
   * Returns an object URL backed by a Blob so it works cross-origin.
   *
   * @param mediaId - The UUID of the media asset to stream.
   */
  const getMediaFileUrl = useCallback(async (mediaId: string): Promise<string> => {
    const baseUrl = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL ?? "") : "";

    let token: string | null = null;
    if (typeof window !== "undefined") {
      token = localStorage.getItem("auth_token");
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(
      `${baseUrl}/api/studio/media/${encodeURIComponent(mediaId)}/file`,
      { headers, credentials: "include" },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch media file (${response.status}): ${response.statusText}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }, []);

  return {
    assets,
    loading,
    error,
    uploading,
    uploadProgress,
    refresh,
    uploadMedia,
    uploadRecording,
    deleteAsset,
    getMediaFileUrl,
  };
}

// ---------------------------------------------------------------------------
// useStudioExport — start export job and poll its status to completion
// ---------------------------------------------------------------------------

/** Polling interval in milliseconds while an export is in progress. */
const EXPORT_POLL_INTERVAL_MS = 2_000;

/**
 * Manages the video export lifecycle for a Video Studio project: initiating a
 * render job, polling status until completion, and providing a download helper.
 *
 * @param projectId - The UUID of the studio project to export.
 *
 * @example
 * const { startExport, exportStatus, downloading, downloadExport } = useStudioExport(projectId);
 */
export function useStudioExport(projectId: string) {
  const [exportStatus, setExportStatus] = useState<VideoExportStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Keep a ref to the polling interval so we can clear it on unmount or cancel.
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  /**
   * Poll the export status endpoint until the job reaches a terminal state
   * ("completed" | "failed" | "cancelled").
   */
  const pollExportStatus = useCallback(
    (exportId: string) => {
      stopPolling();

      pollIntervalRef.current = setInterval(async () => {
        try {
          const { data } = await getClient().get<VideoExportStatus>(
            `/api/studio/exports/${encodeURIComponent(exportId)}`,
          );
          setExportStatus(data);

          const terminal = ["completed", "failed", "cancelled"];
          if (terminal.includes(data.status)) {
            stopPolling();
            if (data.status === "failed") {
              setError(data.error_message ?? "Export failed");
            }
          }
        } catch (err) {
          stopPolling();
          setError(extractErrorMessage(err, "Failed to poll export status"));
        }
      }, EXPORT_POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  /**
   * Fetch the current status of an existing export job without starting polling.
   *
   * @param exportId - The UUID of the export job to query.
   */
  const fetchExportStatus = useCallback(async (exportId: string): Promise<VideoExportStatus> => {
    try {
      setError(null);
      const { data } = await getClient().get<VideoExportStatus>(
        `/api/studio/exports/${encodeURIComponent(exportId)}`,
      );
      setExportStatus(data);
      return data;
    } catch (err) {
      const msg = extractErrorMessage(err, "Failed to fetch export status");
      setError(msg);
      throw err;
    }
  }, []);

  /**
   * Submit a new export job for the project and begin polling for its status.
   *
   * @param options - Export configuration (format, resolution, settings).
   * @returns The initial export status record returned by the server.
   */
  const startExport = useCallback(
    async (options: ExportStartRequest = {}): Promise<VideoExportStatus> => {
      try {
        setError(null);
        setLoading(true);
        setExportStatus(null);
        stopPolling();

        const { data } = await getClient().post<VideoExportStatus>(
          `/api/studio/projects/${encodeURIComponent(projectId)}/export`,
          options,
        );

        setExportStatus(data);

        // If the job is already terminal (e.g. synchronous export), don't poll.
        const terminal = ["completed", "failed", "cancelled"];
        if (!terminal.includes(data.status)) {
          pollExportStatus(data.id);
        }

        return data;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to start export"));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [projectId, pollExportStatus, stopPolling],
  );

  /**
   * Cancel any in-progress polling (does not cancel the server-side job).
   */
  const cancelPolling = useCallback(() => {
    stopPolling();
  }, [stopPolling]);

  /**
   * Download the rendered video for a completed export job.
   * Returns an object URL for the downloaded Blob.
   *
   * @param exportId - The UUID of the completed export to download.
   */
  const downloadExport = useCallback(async (exportId: string): Promise<string> => {
    try {
      setError(null);
      setDownloading(true);

      const baseUrl = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL ?? "") : "";

      let token: string | null = null;
      if (typeof window !== "undefined") {
        token = localStorage.getItem("auth_token");
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${baseUrl}/api/studio/exports/${encodeURIComponent(exportId)}/download`,
        { headers, credentials: "include" },
      );

      if (!response.ok) {
        if (response.status === 401 && typeof window !== "undefined") {
          window.location.href = "/login";
        }
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Download failed (${response.status}): ${text}`);
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to download export"));
      throw err;
    } finally {
      setDownloading(false);
    }
  }, []);

  return {
    exportStatus,
    loading,
    error,
    downloading,
    startExport,
    fetchExportStatus,
    cancelPolling,
    downloadExport,
  };
}
