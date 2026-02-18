"use client";

import { useState } from "react";
import {
  Button,
  Badge,
  Textarea,
  Input,
} from "@workstation/ui";
import {
  Check,
  Archive,
  Trash2,
  Pin,
  PinOff,
  Pencil,
  X,
  Save,
  Bug,
} from "lucide-react";
import type { NoteResponse, NoteUpdateRequest } from "@workstation/api/types";

interface NoteItemProps {
  note: NoteResponse;
  onUpdate: (id: string, data: NoteUpdateRequest) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onPromoteToIssue?: (id: string) => Promise<void>;
}

export function NoteItem({ note, onUpdate, onDelete, onComplete, onArchive, onPromoteToIssue }: NoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title || "");
  const [editBody, setEditBody] = useState(note.body);

  const handleSave = async () => {
    await onUpdate(note.id, {
      title: editTitle.trim() || null,
      body: editBody,
    });
    setEditing(false);
  };

  const statusColor =
    note.status === "completed"
      ? "text-green-600"
      : note.status === "archived"
        ? "text-muted-foreground"
        : "";

  return (
    <div
      className={`rounded-md border p-3 text-sm transition-colors ${
        note.status === "completed" ? "opacity-60" : ""
      } ${note.pinned ? "border-primary/40 bg-primary/5" : ""}`}
    >
      {editing ? (
        <div className="space-y-2">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Title (optional)"
            className="h-7 text-xs"
          />
          <Textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="min-h-[50px] text-xs resize-none"
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs gap-1" onClick={handleSave}>
              <Save className="h-3 w-3" /> Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                setEditing(false);
                setEditTitle(note.title || "");
                setEditBody(note.body);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {note.title && (
                <p className={`font-medium text-xs ${statusColor} ${note.status === "completed" ? "line-through" : ""}`}>
                  {note.pinned && <Pin className="inline h-3 w-3 mr-1 text-primary" />}
                  {note.title}
                </p>
              )}
              <p className={`text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-3 ${note.status === "completed" ? "line-through" : ""}`}>
                {note.body}
              </p>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {note.status === "active" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onComplete(note.id)}
                    title="Complete"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onArchive(note.id)}
                    title="Archive"
                  >
                    <Archive className="h-3 w-3" />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
                title={note.pinned ? "Unpin" : "Pin"}
              >
                {note.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </Button>
              {note.project_id && !note.issue_id && onPromoteToIssue && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onPromoteToIssue(note.id)}
                  title="Promote to Issue"
                >
                  <Bug className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setEditing(true)}
                title="Edit"
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                onClick={() => onDelete(note.id)}
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {note.category_name && (
              <Badge
                variant="secondary"
                className="text-[10px] h-4"
                style={note.category_color ? { backgroundColor: note.category_color + "20", color: note.category_color } : undefined}
              >
                {note.category_name}
              </Badge>
            )}
            {note.project_name && (
              <Badge variant="outline" className="text-[10px] h-4">
                {note.project_name}
              </Badge>
            )}
            {note.issue_id && (
              <Badge variant="destructive" className="text-[10px] h-4">
                Issue
              </Badge>
            )}
            {note.status !== "active" && (
              <Badge
                variant={note.status === "completed" ? "default" : "secondary"}
                className="text-[10px] h-4"
              >
                {note.status}
              </Badge>
            )}
          </div>
        </>
      )}
    </div>
  );
}
