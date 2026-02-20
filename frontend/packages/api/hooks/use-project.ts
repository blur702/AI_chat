"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { ProjectContext, ChatSummary, ProjectUpdateRequest } from "../types";
import { extractErrorMessage } from "../utils/error";

interface UseProjectReturn {
  project: ProjectContext | null;
  chats: ChatSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateProject: (data: ProjectUpdateRequest) => Promise<boolean>;
}

/**
 * Fetches the full project context (including its chats) for a single project.
 * @param projectId - The project to load, or `null` to clear state.
 * @returns Project context, chat list derived from it, loading/error state, and an `updateProject` function.
 */
export function useProject(projectId: string | null): UseProjectReturn {
  const [project, setProject] = useState<ProjectContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const ctx = await getClient().getProjectContext(projectId);
      setProject(ctx);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to fetch project"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      refresh();
    } else {
      setProject(null);
    }
  }, [projectId, refresh]);

  const updateProject = useCallback(
    async (data: ProjectUpdateRequest): Promise<boolean> => {
      if (!projectId) return false;
      try {
        setError(null);
        await getClient().updateProject(projectId, data);
        await refresh();
        return true;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to update project"));
        return false;
      }
    },
    [projectId, refresh]
  );

  return {
    project,
    chats: project?.chats ?? [],
    loading,
    error,
    refresh,
    updateProject,
  };
}
