"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getClient } from "@workstation/api";
import type { NoteResponse } from "@workstation/api/types";
import { Badge, Button } from "@workstation/ui";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

export function NotesManagement() {
  const [notes, setNotes] = useState<NoteResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const requestIdRef = useRef(0);

  const fetchNotes = useCallback(async () => {
    const id = ++requestIdRef.current;
    setLoading(true);
    try {
      setError(null);
      const res = await getClient().adminListNotes({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 200,
      });
      if (cancelledRef.current || id !== requestIdRef.current) return;
      setNotes(res.notes);
      setTotal(res.count);
    } catch (err) {
      if (cancelledRef.current || id !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load notes");
    } finally {
      if (!cancelledRef.current && id === requestIdRef.current) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchNotes();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchNotes]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    try {
      await getClient().adminDeleteNote(id);
      if (cancelledRef.current) return;
      await fetchNotes();
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to delete note");
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Notes Management</h3>
          <p className="text-xs text-muted-foreground">
            View and manage all user notes ({total} total).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter notes by status"
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
                <th scope="col" className="px-3 py-2 text-left font-medium">Title</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Category</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Project</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Created</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
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
                      aria-label={`Delete note: ${note.title || "untitled"}`}
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
