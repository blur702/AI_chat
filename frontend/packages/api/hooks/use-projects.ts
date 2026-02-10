"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  ProjectSummary,
  ProjectCreateRequest,
  ProjectCreateResponse,
  ProjectUpdateRequest,
  ProjectUpdateResponse,
} from "../types";

export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().listProjects();
      setProjects(res.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProject = useCallback(
    async (data: ProjectCreateRequest): Promise<ProjectCreateResponse> => {
      const result = await getClient().createProject(data);
      await refresh();
      return result;
    },
    [refresh]
  );

  const updateProject = useCallback(
    async (id: string, data: ProjectUpdateRequest): Promise<ProjectUpdateResponse> => {
      const result = await getClient().updateProject(id, data);
      await refresh();
      return result;
    },
    [refresh]
  );

  const deleteProject = useCallback(
    async (id: string): Promise<void> => {
      await getClient().deleteProject(id);
      await refresh();
    },
    [refresh]
  );

  return {
    projects,
    loading,
    error,
    refresh,
    createProject,
    updateProject,
    deleteProject,
  };
}
