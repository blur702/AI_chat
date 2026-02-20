"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workstation/ui";
import { Plus, Film, Trash2, Calendar, Clock } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

interface StudioProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  duration_seconds: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function StudioPage() {
  const router = useRouter();
  const isMountedRef = useRef(true);
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/studio/projects", {
        credentials: "include",
      });
      if (res.status === 401) {
        router.push(`/login?returnTo=${encodeURIComponent("/studio")}`);
        return;
      }
      if (!res.ok) {
        console.error("Failed to load projects:", res.status);
        return;
      }
      const data = await res.json();
      if (isMountedRef.current) setProjects(data.projects || []);
    } catch (err) {
      console.error("Failed to fetch studio projects:", err);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchProjects();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchProjects]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled Project" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Failed to create project:", res.status, err);
        if (res.status === 401) {
          router.push(`/login?returnTo=${encodeURIComponent("/studio")}`);
        }
        return;
      }
      const project = await res.json();
      router.push(`/studio/${project.id}`);
    } catch (err) {
      console.error("Create project error:", err);
    } finally {
      if (isMountedRef.current) setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    try {
      const res = await fetch(`/api/studio/projects/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 401) {
        router.push(`/login?returnTo=${encodeURIComponent("/studio")}`);
        return;
      }
      if (!res.ok) {
        console.error("Failed to delete project:", res.status);
        return;
      }
      if (isMountedRef.current) setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Delete project error:", err);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds == null) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3 md:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-1.5 text-sm font-semibold">
              Video Studio
              <FieldHelp slug="studio-overview" tip="Timeline-based video editor for screen recordings, text overlays, subtitles, and export." />
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Create e-learning videos with screen recordings, callouts, and narration
            </p>
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            <Plus className="mr-2 h-4 w-4" />
            {creating ? "Creating..." : "New Project"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-lg border bg-muted" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 py-20 text-center">
              <Film className="mx-auto mb-4 h-16 w-16 text-muted-foreground/50" />
              <h2 className="mb-2 text-xl font-semibold">No projects yet</h2>
              <p className="mb-4 text-muted-foreground">
                Create your first video project to get started
              </p>
              <Button onClick={handleCreate} disabled={creating}>
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  role="button"
                  tabIndex={0}
                  key={project.id}
                  onClick={() => router.push(`/studio/${project.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/studio/${project.id}`);
                    }
                  }}
                  className="group relative w-full cursor-pointer rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <div className="mb-3 flex aspect-video items-center justify-center rounded bg-muted">
                    <Film className="h-10 w-10 text-muted-foreground/30" />
                  </div>
                  <h3 className="truncate font-semibold">{project.name}</h3>
                  {project.description && (
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(project.duration_seconds)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(project.updated_at)}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize">
                      {project.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete project"
                    onClick={(e) => handleDelete(project.id, e)}
                    className="absolute right-3 top-3 rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
