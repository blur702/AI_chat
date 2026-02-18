"use client";

import { useState } from "react";
import { Button, ScrollArea } from "@workstation/ui";
import { Plus } from "lucide-react";
import { useNotes } from "@workstation/api/hooks/use-notes";
import { useProjects } from "@workstation/api/hooks/use-projects";
import { KanbanBoard } from "@/components/notes/kanban-board";
import { NoteCreateForm } from "@/components/notes/note-create-form";

export default function NotesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { notes, categories, loading, createNote, updateNote, deleteNote } = useNotes({
    status: statusFilter === "all" ? undefined : statusFilter,
    category_id: categoryFilter === "all" ? undefined : categoryFilter,
  });

  const { projects } = useProjects();

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <h1 className="text-sm font-semibold">Notes Kanban</h1>

        <div className="ml-4 flex items-center gap-1.5">
          <select
            className="h-7 rounded-md border bg-background px-2 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>

          <select
            className="h-7 rounded-md border bg-background px-2 text-xs"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1" />

        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-3 w-3" />
          New Note
        </Button>
      </div>

      {/* Create form (collapsible) */}
      {showCreate && (
        <div className="border-b px-4 py-3">
          <NoteCreateForm
            categories={categories}
            projects={projects}
            onSubmit={async (data) => {
              await createNote(data);
              setShowCreate(false);
            }}
          />
        </div>
      )}

      {/* Kanban board */}
      <ScrollArea className="flex-1">
        <KanbanBoard
          notes={notes}
          projects={projects}
          loading={loading}
          onUpdateNote={updateNote}
          onDeleteNote={deleteNote}
          onCreateNote={createNote}
        />
      </ScrollArea>
    </div>
  );
}
