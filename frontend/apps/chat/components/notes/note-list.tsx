"use client";

import { Badge } from "@workstation/ui";
import { Loader2 } from "lucide-react";
import type { NoteResponse, NoteUpdateRequest, NoteCategoryResponse } from "@workstation/api/types";
import { NoteItem } from "./note-item";

interface NoteListProps {
  notes: NoteResponse[];
  categories: NoteCategoryResponse[];
  loading: boolean;
  error: string | null;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (categoryId: string) => void;
  onUpdate: (id: string, data: NoteUpdateRequest) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onPromoteToIssue?: (id: string) => Promise<void>;
}

export function NoteList({
  notes,
  categories,
  loading,
  error,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  onUpdate,
  onDelete,
  onComplete,
  onArchive,
  onPromoteToIssue,
}: NoteListProps) {
  if (loading && notes.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <p className="py-4 text-center text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-2">
      {/* Filters */}
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => onCategoryFilterChange(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <Badge variant="secondary" className="ml-auto text-[10px]">
          {notes.length} note{notes.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Note list */}
      {notes.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No notes yet. Write one above.
        </p>
      ) : (
        <div className="space-y-1.5">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onUpdate={async (id, data) => {
                await onUpdate(id, data);
              }}
              onDelete={async (id) => {
                await onDelete(id);
              }}
              onComplete={async (id) => {
                await onComplete(id);
              }}
              onArchive={async (id) => {
                await onArchive(id);
              }}
              onPromoteToIssue={
                onPromoteToIssue
                  ? async (id) => {
                      await onPromoteToIssue(id);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
