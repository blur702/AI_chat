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
import { useSystemPrompts } from "@workstation/api";
import { Plus, Pencil, Trash2, Star, Loader2 } from "lucide-react";
import type { SystemPromptCreateRequest, SystemPromptUpdateRequest } from "@workstation/api";
import { FieldHelp } from "@/components/help/field-help";

export function PromptLibrary() {
  const { prompts, loading, error, createPrompt, updatePrompt, deletePrompt, setDefault } =
    useSystemPrompts();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setContent("");
    setDescription("");
    setIsDefault(false);
    setEditingId(null);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (prompt: { id: string; name: string; content: string; description?: string; is_default: boolean }) => {
    setEditingId(prompt.id);
    setName(prompt.name);
    setContent(prompt.content);
    setDescription(prompt.description ?? "");
    setIsDefault(prompt.is_default);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
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

    if (editingId) {
      const data: SystemPromptUpdateRequest = {
        name: name.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        is_default: isDefault,
      };
      const result = await updatePrompt(editingId, data);
      if (!result) {
        setFormError("Failed to update prompt");
        setSaving(false);
        return;
      }
    } else {
      const data: SystemPromptCreateRequest = {
        name: name.trim(),
        content: content.trim(),
        description: description.trim() || undefined,
        is_default: isDefault,
      };
      const result = await createPrompt(data);
      if (!result) {
        setFormError("Failed to create prompt");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    const success = await deletePrompt(id);
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
          <h3 className="text-sm font-semibold">System Prompts</h3>
          <p className="text-xs text-muted-foreground">
            Create and manage reusable system prompts for your conversations.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Prompt
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {prompts.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No system prompts yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{prompt.name}</span>
                  {prompt.is_default && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Default
                    </Badge>
                  )}
                </div>
                {prompt.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {prompt.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {prompt.content.length > 100
                    ? prompt.content.slice(0, 100) + "..."
                    : prompt.content}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!prompt.is_default && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => setDefault(prompt.id)}
                    title="Set as default"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => openEdit(prompt)}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmId(prompt.id)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit System Prompt" : "New System Prompt"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the system prompt details."
                : "Create a reusable system prompt for your conversations."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="prompt-name" className="text-sm font-medium flex items-center gap-1.5">
                Name
                <FieldHelp
                  slug="prompt-library-name"
                  tip="Short label used to identify this reusable system prompt."
                />
              </label>
              <Input
                id="prompt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Code Review Assistant"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="prompt-description" className="text-sm font-medium flex items-center gap-1.5">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
                <FieldHelp
                  slug="prompt-library-description"
                  tip="Optional summary to explain when this prompt should be used."
                />
              </label>
              <Input
                id="prompt-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this prompt's purpose"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="prompt-content" className="text-sm font-medium flex items-center gap-1.5">
                Content
                <FieldHelp
                  slug="prompt-library-content"
                  tip="Instruction text that shapes assistant behavior when selected."
                />
              </label>
              <textarea
                id="prompt-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="You are a helpful AI assistant that..."
                rows={8}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                {content.length} characters
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                role="switch"
                aria-checked={isDefault}
                aria-label="Set as default prompt"
                onClick={() => setIsDefault(!isDefault)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isDefault ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    isDefault ? "translate-x-[18px]" : "translate-x-[2px]"
                  }`}
                />
              </button>
              <span className="text-sm">Set as default prompt</span>
            </div>

            {formError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete System Prompt</DialogTitle>
            <DialogDescription>
              This will remove the prompt and clear it from any projects or chats that use it.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
