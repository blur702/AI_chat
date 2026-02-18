"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "@workstation/api";
import type { NoteResponse } from "@workstation/api/types";
import { Badge, Button } from "@workstation/ui";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

export function NotesManagement() {
  const [notes, setNotes] = useState<NoteResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getClient().adminListNotes({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 200,
      });
      setNotes(res.notes);
      setTotal(res.count);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    try {
      await getClient().deleteNote(id);
      await fetchNotes();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Notes Management</h3>
          <p className="text-xs text-muted-foreground">
            View and manage all user notes ({total} total).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={fetchNotes}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No notes found.</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-left font-medium">Project</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr key={note.id} className="border-b last:border-0">
                  <td className="max-w-[200px] truncate px-3 py-2">
                    {note.title || note.body.slice(0, 40)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={note.status === "active" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {note.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{note.category_name || "-"}</td>
                  <td className="px-3 py-2">{note.project_name || "General"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {note.created_at ? new Date(note.created_at).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleDelete(note.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
