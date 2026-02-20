"use client";

import { useState, useEffect } from "react";
import { useAuth, getClient } from "@workstation/api";

const STORAGE_KEY = "workstation_chat_project_id";

export function useProjectId(): string | null {
  const [projectId, setProjectId] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    let storedId: string | null = null;
    try {
      storedId = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage may be unavailable (e.g., SSR or private mode).
    }

    const envId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID;
    const candidateId = storedId || envId || null;
    if (candidateId) {
      setProjectId(candidateId);
      try {
        localStorage.setItem(STORAGE_KEY, candidateId);
      } catch {
        // Ignore write failures.
      }
      return;
    }

    if (!isAuthenticated) return;

    let cancelled = false;
    (async () => {
      try {
        const client = getClient();
        const res = await client.listProjects();
        let pid: string | null = null;
        if (res.projects && res.projects.length > 0) {
          pid = res.projects[0].id;
        } else {
          const created = await client.createProject({
            name: "Default Project",
            path: "default",
          });
          pid = created.id;
        }
        if (pid && !cancelled) {
          setProjectId(pid);
          try {
            localStorage.setItem(STORAGE_KEY, pid);
          } catch {
            // Ignore write failures.
          }
        }
      } catch {
        // If the API is not available yet, we'll retry when `isAuthenticated` changes.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return projectId;
}
