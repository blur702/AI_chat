"use client";

import { useDraggable } from "@dnd-kit/core";
import { Badge, Button } from "@workstation/ui";
import { Trash2, Bug } from "lucide-react";
import type { NoteResponse, NoteUpdateRequest } from "@workstation/api/types";
import { getClient } from "@workstation/api";
import { useState } from "react";

interface KanbanNoteCardProps {
  note: NoteResponse;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, data: NoteUpdateRequest) => Promise<NoteResponse>;
}

export function KanbanNoteCard({ note, onDelete, onUpdate }: KanbanNoteCardProps) {
  const [promoting, setPromoting] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `note-${note.id}`,
    data: { type: "kanban-note", noteId: note.id },
  });

  const handlePromote = async () => {
    if (!note.project_id) return;
    setPromoting(true);
    try {
      await getClient().promoteNoteToIssue(note.id);
    } catch {
      // ignore
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded-lg border bg-card p-3 transition-opacity active:cursor-grabbing ${
        isDragging ? "z-50 opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {note.title && <p className="truncate text-xs font-medium">{note.title}</p>}
          <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{note.body}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {note.category_name && (
          <Badge
            variant="secondary"
            className="h-4 text-[10px]"
            style={
              note.category_color
                ? {
                    backgroundColor: note.category_color + "20",
                    color: note.category_color,
                  }
                : undefined
            }
          >
            {note.category_name}
          </Badge>
        )}
        {note.issue_id && (
          <Badge variant="destructive" className="h-4 text-[10px]">
            Issue
          </Badge>
        )}
      </div>

      <div className="mt-2 flex items-center gap-0.5">
        {note.project_id && !note.issue_id && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => {
              e.stopPropagation();
              handlePromote();
            }}
            disabled={promoting}
            title="Promote to Issue"
          >
            <Bug className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
