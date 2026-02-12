"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { getClient } from "../client";
import type {
  GitImportRequest,
  GitImportResponse,
  ArchiveUploadResponse,
  ImportStatusResponse,
  DetectionResultResponse,
  CloneProjectRequest,
  CloneProjectResponse,
  SnapshotInfo,
  SnapshotListResponse,
} from "../types";

export interface UseProjectImportReturn {
  // Import
  importFromGit: (data: GitImportRequest) => Promise<GitImportResponse>;
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
        const msg = err instanceof Error ? err.message : "Git import failed";
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
        const msg = err instanceof Error ? err.message : "Archive import failed";
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
      const msg = err instanceof Error ? err.message : "Export failed";
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
        const msg = err instanceof Error ? err.message : "Clone failed";
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
      const msg = err instanceof Error ? err.message : "Failed to load snapshots";
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
        const msg = err instanceof Error ? err.message : "Failed to create snapshot";
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
        const msg = err instanceof Error ? err.message : "Failed to restore snapshot";
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
        const msg = err instanceof Error ? err.message : "Failed to delete snapshot";
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
      const msg = err instanceof Error ? err.message : "Detection failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    importFromGit,
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
