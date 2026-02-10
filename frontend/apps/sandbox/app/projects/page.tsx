"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Button,
  Badge,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Skeleton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workstation/ui";
import { FolderOpen, Plus, AlertCircle, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useProjects } from "@workstation/api/hooks";
import type { ProjectSummary } from "@workstation/api/types";

const PROJECT_TYPES = ["python", "typescript", "javascript", "go", "rust", "other"];

export default function ProjectsPage() {
  const { projects, loading, error, createProject, updateProject, deleteProject } = useProjects();

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPath, setCreatePath] = useState("");
  const [createType, setCreateType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editPath, setEditPath] = useState("");
  const [editType, setEditType] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!createName.trim() || !createPath.trim()) {
      setFormError("Name and path are required.");
      return;
    }
    try {
      setSubmitting(true);
      setFormError(null);
      await createProject({
        name: createName.trim(),
        path: createPath.trim(),
        type: createType || undefined,
      });
      setCreateOpen(false);
      setCreateName("");
      setCreatePath("");
      setCreateType("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (project: ProjectSummary) => {
    setEditProject(project);
    setEditName(project.name);
    setEditPath(project.path);
    setEditType(project.type ?? "");
    setEditError(null);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editProject) return;
    if (!editName.trim() || !editPath.trim()) {
      setEditError("Name and path are required.");
      return;
    }
    try {
      setEditSubmitting(true);
      setEditError(null);
      await updateProject(editProject.id, {
        name: editName.trim(),
        path: editPath.trim(),
        type: editType || undefined,
      });
      setEditOpen(false);
      setEditProject(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update project");
    } finally {
      setEditSubmitting(false);
    }
  };

  const openDelete = (project: ProjectSummary) => {
    setDeleteTarget(project);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      await deleteProject(deleteTarget.id);
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {loading && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border p-4">
              <Skeleton className="h-8 w-8 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FolderOpen className="mx-auto h-12 w-12 mb-4" />
          <p>No projects yet. Create one to get started.</p>
        </div>
      )}

      {!loading && !error && projects.length > 0 && (
        <div className="grid gap-4">
          {projects.map((project) => (
            <div key={project.id} className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent">
              <Link href={`/workspace/${project.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                <FolderOpen className="h-8 w-8 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{project.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">{project.path}</p>
                </div>
                {project.type && <Badge variant="secondary">{project.type}</Badge>}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={(e) => e.preventDefault()}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(project)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => openDelete(project)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          setFormError(null);
          setCreateName("");
          setCreatePath("");
          setCreateType("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>
              Create a new project by providing a name and workspace path.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="create-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="create-name"
                placeholder="My Project"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="create-path" className="text-sm font-medium">
                Path
              </label>
              <Input
                id="create-path"
                placeholder="/workspace/my-project"
                value={createPath}
                onChange={(e) => setCreatePath(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="create-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="create-type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={createType}
                onChange={(e) => setCreateType(e.target.value)}
              >
                <option value="">Select type (optional)</option>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => {
        setEditOpen(open);
        if (!open) setEditError(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update the project name, path, or type.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="edit-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="edit-name"
                placeholder="My Project"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="edit-path" className="text-sm font-medium">
                Path
              </label>
              <Input
                id="edit-path"
                placeholder="/workspace/my-project"
                value={editPath}
                onChange={(e) => setEditPath(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="edit-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="edit-type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
              >
                <option value="">Select type (optional)</option>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={editSubmitting}>
              {editSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
