"use client";

import { useState, useRef } from "react";
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
  DropdownMenuSeparator,
} from "@workstation/ui";
import {
  FolderOpen,
  Plus,
  AlertCircle,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  Server,
  Cpu,
  HardDrive,
  GitBranch,
  Upload,
  Download,
  Copy,
  Loader2,
} from "lucide-react";
import { useProjects, useTemplates, useProjectImport } from "@workstation/api/hooks";
import type { ProjectSummary, TemplateInfo } from "@workstation/api/types";

const IMPORT_STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  cloning: "Cloning repository...",
  extracting: "Extracting archive...",
  detecting: "Detecting project type...",
  installing: "Installing dependencies...",
  completed: "Completed",
  failed: "Failed",
};

export default function ProjectsPage() {
  const { projects, loading, error, createProject, updateProject, deleteProject } = useProjects();
  const { templates, categories, loading: templatesLoading } = useTemplates();
  const {
    importFromGit,
    importFromArchive,
    importStatus,
    stopPolling,
    exportProject,
    cloneProject,
    loading: importLoading,
    error: importError,
  } = useProjectImport();

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPath, setCreatePath] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateInfo | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editPath, setEditPath] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Git import dialog state
  const [gitImportOpen, setGitImportOpen] = useState(false);
  const [gitUrl, setGitUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [gitName, setGitName] = useState("");
  const [gitInstallDeps, setGitInstallDeps] = useState(true);
  const [gitError, setGitError] = useState<string | null>(null);

  // Archive import dialog state
  const [archiveImportOpen, setArchiveImportOpen] = useState(false);
  const [archiveName, setArchiveName] = useState("");
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [archiveInstallDeps, setArchiveInstallDeps] = useState(true);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clone dialog state
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneTarget, setCloneTarget] = useState<ProjectSummary | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [clonePath, setClonePath] = useState("");
  const [cloneSubmitting, setCloneSubmitting] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const filteredTemplates = categoryFilter
    ? templates.filter((t) => t.category === categoryFilter)
    : templates;

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
        type: selectedTemplate?.category,
        template_id: selectedTemplate?.id,
      });
      setCreateOpen(false);
      setCreateName("");
      setCreatePath("");
      setSelectedTemplate(null);
      setCategoryFilter(null);
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

  const handleGitImport = async () => {
    if (!gitUrl.trim() || !gitName.trim()) {
      setGitError("Name and Git URL are required.");
      return;
    }
    if (!gitUrl.trim().startsWith("https://")) {
      setGitError("Only HTTPS Git URLs are allowed.");
      return;
    }
    try {
      setGitError(null);
      await importFromGit({
        name: gitName.trim(),
        git_url: gitUrl.trim(),
        branch: gitBranch.trim() || undefined,
        install_deps: gitInstallDeps,
      });
    } catch (err) {
      setGitError(err instanceof Error ? err.message : "Git import failed");
    }
  };

  const handleArchiveImport = async () => {
    if (!archiveName.trim() || !archiveFile) {
      setArchiveError("Name and file are required.");
      return;
    }
    try {
      setArchiveError(null);
      await importFromArchive(archiveName.trim(), archiveFile, archiveInstallDeps);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Archive import failed");
    }
  };

  const handleExport = async (project: ProjectSummary) => {
    try {
      await exportProject(project.id);
    } catch {
      // Error is set in hook
    }
  };

  const openClone = (project: ProjectSummary) => {
    setCloneTarget(project);
    setCloneName(`${project.name} (Copy)`);
    setClonePath(`${project.path}-copy`);
    setCloneError(null);
    setCloneOpen(true);
  };

  const handleClone = async () => {
    if (!cloneTarget || !cloneName.trim()) {
      setCloneError("Name is required.");
      return;
    }
    try {
      setCloneSubmitting(true);
      setCloneError(null);
      await cloneProject(cloneTarget.id, {
        name: cloneName.trim(),
        path: clonePath.trim() || undefined,
      });
      setCloneOpen(false);
      setCloneTarget(null);
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloneSubmitting(false);
    }
  };

  const isImporting = importStatus && !["completed", "failed"].includes(importStatus.status);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Projects</h1>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Import
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setGitImportOpen(true)}>
                <GitBranch className="mr-2 h-4 w-4" />
                From Git Repository
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setArchiveImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                From Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>
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
                  <DropdownMenuItem onClick={() => handleExport(project)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Export
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openClone(project)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Clone
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
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
          setSelectedTemplate(null);
          setCategoryFilter(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>
              Choose a template and provide a name for your project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Template selection */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Template</label>
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  type="button"
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    categoryFilter === null
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => setCategoryFilter(null)}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                      categoryFilter === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {templatesLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-28 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`relative rounded-lg border-2 p-4 text-left transition-colors hover:border-primary/50 ${
                      selectedTemplate === null
                        ? "border-primary bg-primary/5"
                        : "border-muted"
                    }`}
                    onClick={() => setSelectedTemplate(null)}
                  >
                    {selectedTemplate === null && (
                      <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                    )}
                    <FolderOpen className="h-6 w-6 text-muted-foreground mb-2" />
                    <div className="font-medium text-sm">Blank Project</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Empty workspace, no template applied.
                    </p>
                  </button>
                  {filteredTemplates.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      className={`relative rounded-lg border-2 p-4 text-left transition-colors hover:border-primary/50 ${
                        selectedTemplate?.id === tmpl.id
                          ? "border-primary bg-primary/5"
                          : "border-muted"
                      }`}
                      onClick={() => setSelectedTemplate(tmpl)}
                    >
                      {selectedTemplate?.id === tmpl.id && (
                        <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <Server className="h-5 w-5 text-muted-foreground" />
                        <Badge variant="outline" className="text-[10px] capitalize">{tmpl.category}</Badge>
                      </div>
                      <div className="font-medium text-sm">{tmpl.name}</div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {tmpl.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        {tmpl.exposed_ports.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Cpu className="h-3 w-3" />
                            {tmpl.exposed_ports.join(", ")}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {tmpl.memory_limit}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                placeholder="my-project"
                value={createPath}
                onChange={(e) => setCreatePath(e.target.value)}
              />
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
              Update the project name or path.
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
      <Dialog open={deleteOpen} onOpenChange={(open) => {
        setDeleteOpen(open);
        if (!open) {
          setDeleteError(null);
        }
      }}>
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

      {/* Git Import Dialog */}
      <Dialog open={gitImportOpen} onOpenChange={(open) => {
        if (!open) {
          stopPolling();
          setGitUrl("");
          setGitBranch("");
          setGitName("");
          setGitInstallDeps(true);
          setGitError(null);
        }
        setGitImportOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Git</DialogTitle>
            <DialogDescription>
              Clone a Git repository into a new project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="git-url" className="text-sm font-medium">
                Repository URL
              </label>
              <Input
                id="git-url"
                placeholder="https://github.com/user/repo.git"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                disabled={!!isImporting}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="git-branch" className="text-sm font-medium">
                Branch (optional)
              </label>
              <Input
                id="git-branch"
                placeholder="main"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                disabled={!!isImporting}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="git-name" className="text-sm font-medium">
                Project Name
              </label>
              <Input
                id="git-name"
                placeholder="My Project"
                value={gitName}
                onChange={(e) => setGitName(e.target.value)}
                maxLength={255}
                disabled={!!isImporting}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={gitInstallDeps}
                onChange={(e) => setGitInstallDeps(e.target.checked)}
                disabled={!!isImporting}
                className="rounded border-input"
              />
              Auto-install dependencies
            </label>
            {importStatus && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  {isImporting && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {importStatus.status === "completed" && <Check className="h-4 w-4 text-green-500" />}
                  {importStatus.status === "failed" && <AlertCircle className="h-4 w-4 text-destructive" />}
                  <span className="text-sm font-medium">
                    {IMPORT_STATUS_LABELS[importStatus.status] || importStatus.status}
                  </span>
                </div>
                {importStatus.progress_message && (
                  <p className="text-xs text-muted-foreground mt-1">{importStatus.progress_message}</p>
                )}
                {importStatus.error_message && (
                  <p className="text-xs text-destructive mt-1">{importStatus.error_message}</p>
                )}
                {importStatus.detected_type && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Detected: {importStatus.detected_type}
                    {importStatus.detected_template_id && ` (${importStatus.detected_template_id})`}
                  </p>
                )}
              </div>
            )}
            {gitError && <p className="text-sm text-destructive">{gitError}</p>}
            {importError && <p className="text-sm text-destructive">{importError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGitImportOpen(false)}>
              {importStatus?.status === "completed" ? "Close" : "Cancel"}
            </Button>
            {!isImporting && importStatus?.status !== "completed" && (
              <Button onClick={handleGitImport} disabled={importLoading}>
                {importLoading ? "Starting..." : "Import"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Import Dialog */}
      <Dialog open={archiveImportOpen} onOpenChange={(open) => {
        if (!open) {
          stopPolling();
          setArchiveName("");
          setArchiveFile(null);
          setArchiveInstallDeps(true);
          setArchiveError(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
        setArchiveImportOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Archive</DialogTitle>
            <DialogDescription>
              Upload a zip or tar archive to create a new project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="archive-name" className="text-sm font-medium">
                Project Name
              </label>
              <Input
                id="archive-name"
                placeholder="My Project"
                value={archiveName}
                onChange={(e) => setArchiveName(e.target.value)}
                maxLength={255}
                disabled={!!isImporting}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="archive-file" className="text-sm font-medium">
                Archive File
              </label>
              <input
                ref={fileInputRef}
                id="archive-file"
                type="file"
                accept=".zip,.tar,.tar.gz,.tgz,.tar.bz2"
                onChange={(e) => setArchiveFile(e.target.files?.[0] ?? null)}
                disabled={!!isImporting}
                className="text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={archiveInstallDeps}
                onChange={(e) => setArchiveInstallDeps(e.target.checked)}
                disabled={!!isImporting}
                className="rounded border-input"
              />
              Auto-install dependencies
            </label>
            {importStatus && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  {isImporting && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {importStatus.status === "completed" && <Check className="h-4 w-4 text-green-500" />}
                  {importStatus.status === "failed" && <AlertCircle className="h-4 w-4 text-destructive" />}
                  <span className="text-sm font-medium">
                    {IMPORT_STATUS_LABELS[importStatus.status] || importStatus.status}
                  </span>
                </div>
                {importStatus.progress_message && (
                  <p className="text-xs text-muted-foreground mt-1">{importStatus.progress_message}</p>
                )}
                {importStatus.error_message && (
                  <p className="text-xs text-destructive mt-1">{importStatus.error_message}</p>
                )}
                {importStatus.detected_type && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Detected: {importStatus.detected_type}
                    {importStatus.detected_template_id && ` (${importStatus.detected_template_id})`}
                  </p>
                )}
              </div>
            )}
            {archiveError && <p className="text-sm text-destructive">{archiveError}</p>}
            {importError && <p className="text-sm text-destructive">{importError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveImportOpen(false)}>
              {importStatus?.status === "completed" ? "Close" : "Cancel"}
            </Button>
            {!isImporting && importStatus?.status !== "completed" && (
              <Button onClick={handleArchiveImport} disabled={importLoading}>
                {importLoading ? "Uploading..." : "Import"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Project Dialog */}
      <Dialog open={cloneOpen} onOpenChange={(open) => {
        setCloneOpen(open);
        if (!open) setCloneError(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Project</DialogTitle>
            <DialogDescription>
              Create a copy of <strong>{cloneTarget?.name}</strong> with all its files.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="clone-name" className="text-sm font-medium">
                New Project Name
              </label>
              <Input
                id="clone-name"
                placeholder="My Project (Copy)"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="clone-path" className="text-sm font-medium">
                Path (optional)
              </label>
              <Input
                id="clone-path"
                placeholder="my-project-copy"
                value={clonePath}
                onChange={(e) => setClonePath(e.target.value)}
              />
            </div>
            {cloneError && (
              <p className="text-sm text-destructive">{cloneError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClone} disabled={cloneSubmitting}>
              {cloneSubmitting ? "Cloning..." : "Clone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
