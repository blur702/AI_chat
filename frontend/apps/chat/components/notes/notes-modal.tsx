"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { ScrollArea } from "@workstation/ui";
import { StickyNote, X, LayoutGrid, Download, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/help/field-help";
import { useNotes as useNotesContext } from "./notes-provider";
import { useNotes as useNotesData } from "@workstation/api/hooks/use-notes";
import { useProjects } from "@workstation/api/hooks/use-projects";
import { getClient } from "@workstation/api";
import { NoteCreateForm } from "./note-create-form";
import { NoteList } from "./note-list";

export function NotesModal() {
  const { isOpen, closeNotes } = useNotesContext();

  if (!isOpen) return null;

  return <NotesModalContent closeNotes={closeNotes} />;
}

function NotesModalContent({ closeNotes }: { closeNotes: () => void }) {
  const [statusFilter, setStatusFilter] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const {
    notes,
    categories,
    loading,
    error,
    refresh,
    createNote,
    updateNote,
    deleteNote,
    completeNote,
    archiveNote,
  } = useNotesData({
    status: statusFilter === "all" ? undefined : statusFilter,
    category_id: categoryFilter === "all" ? undefined : categoryFilter,
  });

  const { projects } = useProjects();
  const router = useRouter();
  const [exportDone, setExportDone] = useState(false);

  const titleId = useId();

  // Drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const exportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
    };
  }, []);

  // Focus trap
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleFocusTrap);
    return () => document.removeEventListener("keydown", handleFocusTrap);
  }, []);

  // Drag handler
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    draggingRef.current = true;

    const onPointerMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const panelW = panel.offsetWidth;
      const panelH = panel.offsetHeight;
      const maxX = Math.max(0, window.innerWidth - panelW);
      const maxY = Math.max(0, window.innerHeight - panelH);
      setPosition({
        x: Math.max(0, Math.min(maxX, ev.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(maxY, ev.clientY - dragOffset.current.y)),
      });
    };

    const cleanup = () => {
      draggingRef.current = false;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", cleanup);
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", cleanup);
  }, []);

  const handleExportAppBugs = useCallback(async () => {
    try {
      const { markdown, count } = await getClient().exportAppBugs();
      await navigator.clipboard.writeText(markdown);
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "app-bugs.md";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportDone(true);
      if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
      exportTimeoutRef.current = setTimeout(() => setExportDone(false), 2000);
    } catch (err) {
      console.error("Failed to export app bugs:", err);
    }
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeNotes();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [closeNotes]);

  const panelStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : { right: 16, top: 56 };

  const modal = (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={(e) => {
          e.stopPropagation();
          closeNotes();
        }}
        aria-hidden="true"
      />

      {/* Draggable panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed z-[51] flex w-full max-w-md flex-col rounded-lg border bg-background shadow-lg"
        style={{ ...panelStyle, maxHeight: "80vh" }}
      >
        {/* Header / drag handle */}
        <div
          className="flex cursor-grab select-none items-center justify-between border-b px-4 py-2.5 active:cursor-grabbing"
          onPointerDown={handlePointerDown}
        >
          <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold">
            <StickyNote className="h-4 w-4" />
            Notes
            <FieldHelp slug="notes-overview" tip="Quick-capture notes with categories, AI-generated titles, and markdown export. Pin important notes and promote bugs to trackable issues." />
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExportAppBugs}
              className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              title="Export App Bugs for Claude Code — copies to clipboard and downloads .md"
              aria-label="Export App Bugs"
            >
              {exportDone ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                closeNotes();
                router.push("/notes");
              }}
              className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              title="Open Kanban"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closeNotes}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close notes"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="px-4 pb-2 pt-3">
            <NoteCreateForm
              categories={categories}
              projects={projects}
              onSubmit={async (data) => {
                await createNote(data);
              }}
            />
          </div>

          <ScrollArea className="min-h-0 flex-1 px-4 pb-3" style={{ maxHeight: "50vh" }}>
            <NoteList
              notes={notes}
              categories={categories}
              loading={loading}
              error={error}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
              onUpdate={async (id, data) => {
                await updateNote(id, data);
              }}
              onDelete={async (id) => {
                await deleteNote(id);
              }}
              onComplete={async (id) => {
                await completeNote(id);
              }}
              onArchive={async (id) => {
                await archiveNote(id);
              }}
              onPromoteToIssue={async (id) => {
                await getClient().promoteNoteToIssue(id);
                await refresh();
              }}
            />
          </ScrollArea>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
