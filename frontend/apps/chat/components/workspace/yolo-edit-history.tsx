"use client";

import { useState } from "react";
import {
  Button,
  ScrollArea,
  Badge,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workstation/ui";
import {
  X,
  Undo2,
  Clock,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useYoloEdits } from "@workstation/api/hooks";

interface YoloEditHistoryProps {
  projectId: string;
  onClose: () => void;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function YoloEditHistory({
  projectId,
  onClose,
}: YoloEditHistoryProps) {
  const { edits, loading, error, undo, refresh } = useYoloEdits(projectId);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showUndone, setShowUndone] = useState(false);

  const activeEdits = edits.filter((e) => !e.undo_performed);
  const undoneEdits = edits.filter((e) => e.undo_performed);

  const handleUndo = async () => {
    if (!confirmId) return;
    setUndoingId(confirmId);
    setConfirmId(null);
    try {
      await undo(confirmId);
    } catch {
      // error handled by hook
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase">Edit History</span>
          {activeEdits.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {activeEdits.length}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {loading && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Loading edit history...
            </p>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && edits.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No file edits recorded yet. Edits are tracked automatically when files are saved.
            </p>
          )}

          {/* Active (undoable) edits */}
          {activeEdits.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">
                Recent Edits ({activeEdits.length})
              </h3>
              {activeEdits.map((edit) => (
                <div
                  key={edit.id}
                  className="rounded-md border bg-card p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-blue-500" />
                      <span className="text-xs font-medium">
                        {edit.files_modified.length} file
                        {edit.files_modified.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {edit.created_at && `${formatDate(edit.created_at)} ${formatTime(edit.created_at)}`}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {edit.files_modified.map((f) => (
                      <p
                        key={f}
                        className="text-[11px] text-muted-foreground truncate font-mono"
                        title={f}
                      >
                        {f}
                      </p>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    disabled={undoingId === edit.id}
                    onClick={() => setConfirmId(edit.id)}
                  >
                    {undoingId === edit.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Undo2 className="h-3 w-3" />
                    )}
                    Undo
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Undone edits (collapsible) */}
          {undoneEdits.length > 0 && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground hover:text-foreground"
                onClick={() => setShowUndone(!showUndone)}
              >
                {showUndone ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Undone ({undoneEdits.length})
              </button>
              {showUndone &&
                undoneEdits.map((edit) => (
                  <div
                    key={edit.id}
                    className="rounded-md border bg-card/50 p-3 space-y-2 opacity-60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span className="text-xs">
                          {edit.files_modified.length} file
                          {edit.files_modified.length !== 1 ? "s" : ""} restored
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {edit.created_at && formatTime(edit.created_at)}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {edit.files_modified.map((f) => (
                        <p
                          key={f}
                          className="text-[11px] text-muted-foreground truncate font-mono"
                          title={f}
                        >
                          {f}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Undo confirmation dialog */}
      <Dialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo File Changes?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will restore the modified files to their previous content. The
            current content will be overwritten.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button onClick={handleUndo}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Undo Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
