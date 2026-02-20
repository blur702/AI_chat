"use client";

import { useDroppable } from "@dnd-kit/core";
import { Badge, ScrollArea } from "@workstation/ui";
import type { NoteResponse, NoteUpdateRequest } from "@workstation/api/types";
import { KanbanNoteCard } from "./kanban-note-card";

interface KanbanColumnProps {
  columnId: string;
  title: string;
  projectId: string | null;
  notes: NoteResponse[];
  onDeleteNote: (id: string) => Promise<void>;
  onUpdateNote: (id: string, data: NoteUpdateRequest) => Promise<NoteResponse>;
}

export function KanbanColumn({
  columnId,
  title,
  projectId,
  notes,
  onDeleteNote,
  onUpdateNote,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: { type: "notes-column", projectId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border ${
        isOver ? "border-primary/30 bg-primary/5" : "bg-muted/30"
      }`}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h3 className="truncate text-xs font-semibold">{title}</h3>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {notes.length}
        </Badge>
      </div>
      <ScrollArea className="flex-1 p-2" style={{ maxHeight: "calc(100vh - 200px)" }}>
        <div className="flex flex-col gap-2">
          {notes.length === 0 && (
            <p className="py-4 text-center text-[10px] text-muted-foreground">No notes</p>
          )}
          {notes.map((note) => (
            <KanbanNoteCard
              key={note.id}
              note={note}
              onDelete={onDeleteNote}
              onUpdate={onUpdateNote}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
