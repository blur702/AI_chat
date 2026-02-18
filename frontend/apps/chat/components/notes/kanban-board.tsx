"use client";

import { useCallback, useEffect, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { NoteResponse, NoteCreateRequest, NoteUpdateRequest } from "@workstation/api/types";
import { KanbanColumn } from "./kanban-column";
import { Loader2 } from "lucide-react";

interface ProjectInfo {
  id: string;
  name: string;
}

interface KanbanBoardProps {
  notes: NoteResponse[];
  projects: ProjectInfo[];
  loading: boolean;
  onUpdateNote: (id: string, data: NoteUpdateRequest) => Promise<NoteResponse>;
  onDeleteNote: (id: string) => Promise<void>;
  onCreateNote: (data: NoteCreateRequest) => Promise<NoteResponse>;
}

export function KanbanBoard({
  notes,
  projects,
  loading,
  onUpdateNote,
  onDeleteNote,
  onCreateNote,
}: KanbanBoardProps) {
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const noteId = active.data.current?.noteId as string | undefined;
      const targetProjectId = over.data.current?.projectId as string | null | undefined;

      if (!noteId || targetProjectId === undefined) return;

      const sourceNote = notes.find((n) => n.id === noteId);
      if (!sourceNote) return;

      // Same column — no-op
      if ((sourceNote.project_id ?? null) === targetProjectId) return;

      if (shiftHeld) {
        // Copy
        await onCreateNote({
          title: sourceNote.title ?? undefined,
          body: sourceNote.body,
          project_id: targetProjectId,
          category_id: sourceNote.category_id ?? undefined,
          pinned: sourceNote.pinned,
        });
      } else {
        // Move
        await onUpdateNote(noteId, { project_id: targetProjectId });
      }
    },
    [notes, shiftHeld, onUpdateNote, onCreateNote],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group notes by project
  const notesByProject = new Map<string | null, typeof notes>();
  for (const note of notes) {
    const key = note.project_id ?? null;
    const bucket = notesByProject.get(key);
    if (bucket) bucket.push(note);
    else notesByProject.set(key, [note]);
  }
  const generalNotes = notesByProject.get(null) ?? [];
  const projectGroups = projects.map((p) => ({
    project: p,
    notes: notesByProject.get(p.id) ?? [],
  }));

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex min-h-[400px] gap-4 p-4">
        <KanbanColumn
          columnId="general"
          title="General"
          projectId={null}
          notes={generalNotes}
          onDeleteNote={onDeleteNote}
          onUpdateNote={onUpdateNote}
        />
        {projectGroups.map(({ project, notes: projectNotes }) => (
          <KanbanColumn
            key={project.id}
            columnId={`project-${project.id}`}
            title={project.name}
            projectId={project.id}
            notes={projectNotes}
            onDeleteNote={onDeleteNote}
            onUpdateNote={onUpdateNote}
          />
        ))}
      </div>
      {shiftHeld && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-lg">
          Shift held — drop to copy
        </div>
      )}
    </DndContext>
  );
}
