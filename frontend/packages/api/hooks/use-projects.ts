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
      try {
        setError(null);
        const result = await getClient().createProject(data);
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create project");
        throw err;
      }
    },
    [refresh]
  );

  const updateProject = useCallback(
    async (id: string, data: ProjectUpdateRequest): Promise<ProjectUpdateResponse> => {
      try {
        setError(null);
        const result = await getClient().updateProject(id, data);
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update project");
        throw err;
      }
    },
    [refresh]
  );

  const deleteProject = useCallback(
    async (id: string): Promise<void> => {
      try {
        setError(null);
        await getClient().deleteProject(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete project");
        throw err;
      }
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
