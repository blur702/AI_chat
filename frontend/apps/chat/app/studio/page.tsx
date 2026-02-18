"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workstation/ui";
import { Plus, Film, Trash2, Calendar, Clock } from "lucide-react";

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
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/studio/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Untitled Project" }),
      });
      if (res.ok) {
        const project = await res.json();
        router.push(`/studio/${project.id}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    const token = localStorage.getItem("auth_token");
    await fetch(`/api/studio/projects/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Video Studio</h1>
            <p className="text-muted-foreground mt-1">
              Create e-learning videos with screen recordings, callouts, and narration
            </p>
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            <Plus className="w-4 h-4 mr-2" />
            {creating ? "Creating..." : "New Project"}
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 rounded-lg border bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 border rounded-lg bg-muted/30">
            <Film className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
            <p className="text-muted-foreground mb-4">
              Create your first video project to get started
            </p>
            <Button onClick={handleCreate} disabled={creating}>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => router.push(`/studio/${project.id}`)}
                className="group relative border rounded-lg p-4 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer bg-card"
              >
                <div className="aspect-video rounded bg-muted mb-3 flex items-center justify-center">
                  <Film className="w-10 h-10 text-muted-foreground/30" />
                </div>
                <h3 className="font-semibold truncate">{project.name}</h3>
                {project.description && (
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {project.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(project.duration_seconds)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(project.updated_at)}
                  </span>
                  <span className="capitalize px-1.5 py-0.5 rounded bg-muted text-[10px]">
                    {project.status}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDelete(project.id, e)}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
