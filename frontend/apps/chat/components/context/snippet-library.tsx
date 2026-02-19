"use client";

import { useState } from "react";
import {
  Button,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@workstation/ui";
import { useSnippets } from "@workstation/api";
import type { ContextSnippetCreateRequest, ContextSnippetUpdateRequest } from "@workstation/api";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

export function SnippetLibrary() {
  const { snippets, loading, error, createSnippet, updateSnippet, deleteSnippet } =
    useSnippets();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setContent("");
    setDescription("");
    setTags("");
    setEditingId(null);
    setFormError(null);
    setSaving(false);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (snippet: {
    id: string;
    name: string;
    content: string;
    description?: string | null;
    tags?: string[];
  }) => {
    setEditingId(snippet.id);
    setName(snippet.name);
    setContent(snippet.content);
    setDescription(snippet.description ?? "");
    setTags(snippet.tags?.join(", ") ?? "");
    setFormError(null);
    setSaving(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!content.trim()) {
      setFormError("Content is required");
      return;
    }

    setSaving(true);
    setFormError(null);

    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingId) {
      const data: ContextSnippetUpdateRequest = {
        name: name.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
      };
      const result = await updateSnippet(editingId, data);
      if (!result) {
        setFormError("Failed to update snippet");
        setSaving(false);
        return;
      }
    } else {
      const data: ContextSnippetCreateRequest = {
        name: name.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
      };
      const result = await createSnippet(data);
      if (!result) {
        setFormError("Failed to create snippet");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    const success = await deleteSnippet(id);
    setDeleting(false);
    if (success) {
      setDeleteConfirmId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Context Snippets</h3>
          <p className="text-xs text-muted-foreground">
            Create reusable text snippets to quickly insert into your context layers.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Snippet
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {snippets.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No snippets yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {snippets.map((snippet) => (
            <div
              key={snippet.id}
              className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{snippet.name}</span>
                  {snippet.tags?.map((tag, tagIdx) => (
                    <Badge
                      key={`${tag}-${tagIdx}`}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                {snippet.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {snippet.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {snippet.content.length > 100
                    ? snippet.content.slice(0, 100) + "..."
                    : snippet.content}
                </p>
                {snippet.created_at && (
                  <p className="mt-1 text-[10px] text-muted-foreground/50">
                    {new Date(snippet.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => openEdit(snippet)}
                  aria-label={`Edit ${snippet.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmId(snippet.id)}
                  aria-label={`Delete ${snippet.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Snippet" : "New Snippet"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the snippet details."
                : "Create a reusable context snippet."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="snippet-name" className="text-sm font-medium flex items-center gap-1.5">
                Name
                <FieldHelp
                  slug="snippet-library-name"
                  tip="Human-readable title to quickly find this snippet later."
                />
              </label>
              <Input
                id="snippet-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Project Setup Instructions"
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="snippet-description" className="text-sm font-medium flex items-center gap-1.5">
                Description{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
                <FieldHelp
                  slug="snippet-library-description"
                  tip="Optional one-line summary of the snippet purpose."
                />
              </label>
              <Input
                id="snippet-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="snippet-content" className="text-sm font-medium flex items-center gap-1.5">
                Content
                <FieldHelp
                  slug="snippet-library-content"
                  tip="The reusable text inserted into prompts or context quickly."
                />
              </label>
              <textarea
                id="snippet-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Snippet content..."
                rows={8}
                maxLength={50000}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                {content.length.toLocaleString()} characters
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="snippet-tags" className="text-sm font-medium flex items-center gap-1.5">
                Tags
                <FieldHelp
                  slug="snippet-library-tags"
                  tip="Keywords used to filter and organize snippets."
                />
                <span className="text-muted-foreground font-normal">
                  (comma-separated, optional)
                </span>
              </label>
              <Input
                id="snippet-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. setup, python, prompt"
              />
            </div>

            {formError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Snippet</DialogTitle>
            <DialogDescription>
              This will permanently remove this snippet. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
