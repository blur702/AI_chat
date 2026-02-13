"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Badge,
  ScrollArea,
  Input,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workstation/ui";
import {
  Camera,
  RotateCcw,
  Trash2,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Archive,
} from "lucide-react";
import { useProjectImport } from "@workstation/api/hooks";
import type { SnapshotInfo } from "@workstation/api/types";

interface SnapshotsPanelProps {
  projectId: string;
  onClose?: () => void;
}

export function SnapshotsPanel({ projectId, onClose }: SnapshotsPanelProps) {
  const {
    snapshots,
    loadSnapshots,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
  } = useProjectImport();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadSnapshots(projectId)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load snapshots"))
      .finally(() => setLoading(false));
  }, [projectId, loadSnapshots]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName.trim()) return;
      setCreating(true);
      setError(null);
      try {
        await createSnapshot(projectId, newName.trim());
        setNewName("");
        setShowCreate(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create snapshot");
      } finally {
        setCreating(false);
      }
    },
    [projectId, newName, createSnapshot]
  );

  const handleRestore = useCallback(
    async (name: string) => {
      setRestoring(name);
      setError(null);
      try {
        await restoreSnapshot(projectId, name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to restore snapshot");
      } finally {
        setRestoring(null);
      }
    },
    [projectId, restoreSnapshot]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSnapshot(projectId, deleteTarget);
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete snapshot");
    } finally {
      setDeleting(false);
    }
  }, [projectId, deleteTarget, deleteSnapshot]);

  function formatSize(bytes?: number): string {
    if (bytes === undefined || bytes === null) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Snapshots</span>
          {snapshots.length > 0 && (
            <Badge variant="secondary" className="h-4 text-[9px]">
              {snapshots.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Create snapshot"
            onClick={() => setShowCreate((p) => !p)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="flex items-center gap-1.5 border-b px-3 py-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Snapshot name..."
            className="h-7 text-xs"
            autoFocus
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-7 text-xs shrink-0"
            disabled={creating || !newName.trim()}
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
          </Button>
        </form>
      )}

      {error && (
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-destructive/10">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && snapshots.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Archive className="h-8 w-8 text-muted-foreground/50" />
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">No snapshots</p>
                <p className="text-[10px] text-muted-foreground/70">
                  Create a snapshot to save the current state of your project container
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => setShowCreate(true)}
              >
                <Camera className="h-3 w-3" />
                Create Snapshot
              </Button>
            </div>
          )}

          {snapshots.map((snap: SnapshotInfo) => (
            <div
              key={snap.name}
              className="flex items-center gap-2 rounded-md border px-3 py-2 group"
            >
              <Camera className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium truncate block">{snap.name}</span>
                <p className="text-[10px] text-muted-foreground">
                  {snap.created_at ? new Date(snap.created_at).toLocaleString() : ""}
                  {snap.size ? ` \u00b7 ${formatSize(snap.size)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleRestore(snap.name)}
                  disabled={restoring === snap.name}
                >
                  {restoring === snap.name ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget(snap.name)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-sm">Delete Snapshot</DialogTitle>
          <DialogDescription className="text-xs">
            Are you sure you want to delete snapshot &quot;{deleteTarget}&quot;? This cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
