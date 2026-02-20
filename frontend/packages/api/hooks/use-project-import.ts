"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getClient } from "../client";
import type {
  GitImportRequest,
  GitImportResponse,
  WebsiteImportRequest,
  WebsiteImportResponse,
  ArchiveUploadResponse,
  ImportStatusResponse,
  DetectionResultResponse,
  CloneProjectRequest,
  CloneProjectResponse,
  SnapshotInfo,
} from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseProjectImportReturn {
  // Import
  importFromGit: (data: GitImportRequest) => Promise<GitImportResponse>;
  importFromWebsite: (
    data: WebsiteImportRequest
  ) => Promise<WebsiteImportResponse>;
  importFromArchive: (
    name: string,
    file: File,
    installDeps?: boolean,
    path?: string
  ) => Promise<ArchiveUploadResponse>;
  importStatus: ImportStatusResponse | null;
  pollImportStatus: (importId: string) => void;
  stopPolling: () => void;

  // Export & Clone
  exportProject: (projectId: string) => Promise<void>;
  cloneProject: (
    projectId: string,
    data: CloneProjectRequest
  ) => Promise<CloneProjectResponse>;

  // Snapshots
  snapshots: SnapshotInfo[];
  loadSnapshots: (projectId: string) => Promise<void>;
  createSnapshot: (projectId: string, name: string) => Promise<SnapshotInfo>;
  restoreSnapshot: (projectId: string, name: string) => Promise<void>;
  deleteSnapshot: (projectId: string, name: string) => Promise<void>;

  // Detection
  detectType: (projectId: string) => Promise<DetectionResultResponse>;

  // State
  loading: boolean;
  error: string | null;
}

/**
 * Manages project import (Git, website, archive), export, cloning, snapshots, and project-type detection.
 * Polls import status automatically and cleans up on unmount.
 * @returns Import/export/clone functions, snapshot management, import status, and loading/error state.
 */
export function useProjectImport(): UseProjectImportReturn {
  const [importStatus, setImportStatus] = useState<ImportStatusResponse | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const pollImportStatus = useCallback(
    (importId: string) => {
      stopPolling();

      const poll = async () => {
        try {
          const status = await getClient().getImportStatus(importId);
          setImportStatus(status);
          if (status.status === "completed" || status.status === "failed") {
            stopPolling();
          }
        } catch {
          stopPolling();
        }
      };

      // Immediate first poll
      poll();
      pollingRef.current = setInterval(poll, 2000);
    },
    [stopPolling]
  );

  const importFromGit = useCallback(
    async (data: GitImportRequest) => {
      try {
        setLoading(true);
        setError(null);
        const res = await getClient().importFromGit(data);
        setImportStatus({
          import_id: res.import_id,
          project_id: res.project_id,
          import_type: "git",
          status: res.status,
          progress_message: res.message,
          import_options: {},
        });
        pollImportStatus(res.import_id);
        return res;
      } catch (err) {
        const msg = extractErrorMessage(err, "Git import failed");
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [pollImportStatus]
  );

  const importFromArchive = useCallback(
    async (
      name: string,
      file: File,
      installDeps?: boolean,
      path?: string
    ) => {
      try {
        setLoading(true);
        setError(null);
        const res = await getClient().importFromArchive(name, file, installDeps, path);
        setImportStatus({
          import_id: res.import_id,
          project_id: res.project_id,
          import_type: "upload",
          status: res.status,
          progress_message: res.message,
          import_options: {},
        });
        pollImportStatus(res.import_id);
        return res;
      } catch (err) {
        const msg = extractErrorMessage(err, "Archive import failed");
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [pollImportStatus]
  );

  const importFromWebsite = useCallback(
    async (data: WebsiteImportRequest) => {
      try {
        setLoading(true);
        setError(null);
        const res = await getClient().importFromWebsite(data);
        setImportStatus({
          import_id: res.import_id,
          project_id: res.project_id,
          import_type: "website",
          status: res.status,
          progress_message: res.message,
          import_options: {},
        });
        pollImportStatus(res.import_id);
        return res;
      } catch (err) {
        const msg = extractErrorMessage(err, "Website import failed");
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [pollImportStatus]
  );

  const exportProject = useCallback(async (projectId: string) => {
    try {
      setLoading(true);
      setError(null);
      const blob = await getClient().exportProject(projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${projectId.slice(0, 8)}.tar`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = extractErrorMessage(err, "Export failed");
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const cloneProject = useCallback(
    async (projectId: string, data: CloneProjectRequest) => {
      try {
        setLoading(true);
        setError(null);
        return await getClient().cloneProject(projectId, data);
      } catch (err) {
        const msg = extractErrorMessage(err, "Clone failed");
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const loadSnapshots = useCallback(async (projectId: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().listSnapshots(projectId);
      setSnapshots(res.snapshots);
    } catch (err) {
      const msg = extractErrorMessage(err, "Failed to load snapshots");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSnapshot = useCallback(
    async (projectId: string, name: string) => {
      try {
        setLoading(true);
        setError(null);
        const res = await getClient().createSnapshot(projectId, { name });
        setSnapshots((prev) => [...prev, res]);
        return res;
      } catch (err) {
        const msg = extractErrorMessage(err, "Failed to create snapshot");
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const restoreSnapshot = useCallback(
    async (projectId: string, name: string) => {
      try {
        setLoading(true);
        setError(null);
        await getClient().restoreSnapshot(projectId, name);
      } catch (err) {
        const msg = extractErrorMessage(err, "Failed to restore snapshot");
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteSnapshot = useCallback(
    async (projectId: string, name: string) => {
      try {
        setLoading(true);
        setError(null);
        await getClient().deleteSnapshot(projectId, name);
        setSnapshots((prev) => prev.filter((s) => s.name !== name));
      } catch (err) {
        const msg = extractErrorMessage(err, "Failed to delete snapshot");
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const detectType = useCallback(async (projectId: string) => {
    try {
      setLoading(true);
      setError(null);
      return await getClient().detectProjectType(projectId);
    } catch (err) {
      const msg = extractErrorMessage(err, "Detection failed");
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    importFromGit,
    importFromWebsite,
    importFromArchive,
    importStatus,
    pollImportStatus,
    stopPolling,
    exportProject,
    cloneProject,
    snapshots,
    loadSnapshots,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    detectType,
    loading,
    error,
  };
}
