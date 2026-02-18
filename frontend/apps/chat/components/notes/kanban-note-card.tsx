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
      className={`rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing transition-opacity ${
        isDragging ? "opacity-50 z-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          {note.title && (
            <p className="text-xs font-medium truncate">{note.title}</p>
          )}
          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
            {note.body}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {note.category_name && (
          <Badge
            variant="secondary"
            className="text-[10px] h-4"
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
          <Badge variant="destructive" className="text-[10px] h-4">
            Issue
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-0.5 mt-2">
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
