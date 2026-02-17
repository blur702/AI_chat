"use client";

import { useCallback, useEffect, useState } from "react";
import { getClient } from "../client";
import type { FileNode } from "../types";
import { extractErrorMessage } from "../utils/error";

interface UseFileExplorerReturn {
  fileTree: FileNode[] | null;
  loading: boolean;
  error: string | null;
  refreshTree: () => Promise<void>;
  createFile: (path: string, content?: string) => Promise<void>;
  createDirectory: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
}

/**
 * Loads and manages the file tree for a sandbox project, including create, delete, and rename operations.
 * @param projectId - The project whose file tree to manage, or `null` to skip fetching.
 * @returns File tree, loading/error state, and functions to create, delete, and rename files and directories.
 */
export function useFileExplorer(projectId: string | null): UseFileExplorerReturn {
  const [fileTree, setFileTree] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTree = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getClient().getFileTree(projectId);
      setFileTree(response.files);
    } catch (err) {
      const msg = extractErrorMessage(err, "Failed to load file tree");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      refreshTree();
    }
  }, [projectId, refreshTree]);

  const createFile = useCallback(
    async (path: string, content?: string) => {
      if (!projectId) return;
      try {
        await getClient().createFile(projectId, path, content);
        await refreshTree();
      } catch (err) {
        const msg = extractErrorMessage(err, "Failed to create file");
        setError(msg);
      }
    },
    [projectId, refreshTree]
  );

  const createDirectory = useCallback(
    async (path: string) => {
      if (!projectId) return;
      try {
        await getClient().createDirectory(projectId, path);
        await refreshTree();
      } catch (err) {
        const msg = extractErrorMessage(err, "Failed to create directory");
        setError(msg);
      }
    },
    [projectId, refreshTree]
  );

  const deleteFile = useCallback(
    async (path: string) => {
      if (!projectId) return;
      try {
        await getClient().deleteFile(projectId, path);
        await refreshTree();
      } catch (err) {
        const msg = extractErrorMessage(err, "Failed to delete");
        setError(msg);
      }
    },
    [projectId, refreshTree]
  );

  const renameFile = useCallback(
    async (oldPath: string, newPath: string) => {
      if (!projectId) return;
      try {
        await getClient().renameFile(projectId, oldPath, newPath);
        await refreshTree();
      } catch (err) {
        const msg = extractErrorMessage(err, "Failed to rename");
        setError(msg);
      }
    },
    [projectId, refreshTree]
  );

  return {
    fileTree,
    loading,
    error,
    refreshTree,
    createFile,
    createDirectory,
    deleteFile,
    renameFile,
  };
}
