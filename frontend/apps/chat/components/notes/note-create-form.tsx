"use client";

import { useState } from "react";
import { Button, Textarea } from "@workstation/ui";
import { Plus, Sparkles, Loader2 } from "lucide-react";
import type { NoteCreateRequest, NoteCategoryResponse } from "@workstation/api/types";
import type { ProjectSummary } from "@workstation/api/types/context";

interface NoteCreateFormProps {
  categories: NoteCategoryResponse[];
  projects: ProjectSummary[];
  onSubmit: (data: NoteCreateRequest) => Promise<void>;
}

export function NoteCreateForm({ categories, projects, onSubmit }: NoteCreateFormProps) {
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [generateTitle, setGenerateTitle] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        body: body.trim(),
        category_id: categoryId || null,
        project_id: projectId || null,
        generate_title: generateTitle,
      });
      setBody("");
      setCategoryId("");
      setProjectId("");
      setGenerateTitle(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 border-b pb-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a note..."
        className="min-h-[60px] resize-none text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">General</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <Button
          variant={generateTitle ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setGenerateTitle(!generateTitle)}
        >
          <Sparkles className="h-3 w-3" />
          AI Title
        </Button>

        <div className="flex-1" />

        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={!body.trim() || submitting}
          onClick={handleSubmit}
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </Button>
      </div>
    </div>
  );
}
