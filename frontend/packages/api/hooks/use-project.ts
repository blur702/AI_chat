"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { ProjectContext, ChatSummary } from "../types";

interface UseProjectReturn {
  project: ProjectContext | null;
  chats: ChatSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

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
      setError(err instanceof Error ? err.message : "Failed to fetch project");
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

  return {
    project,
    chats: project?.chats ?? [],
    loading,
    error,
    refresh,
  };
}
