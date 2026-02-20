"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@workstation/ui";
import { ArrowLeft, Save, Download, Monitor } from "lucide-react";
import { useStudioStore } from "./use-studio-store";
import { ExportDialog } from "./export-dialog";

interface StudioToolbarProps {
  onSave: () => Promise<void>;
  projectId: string;
}

export function StudioToolbar({ onSave, projectId }: StudioToolbarProps) {
  const router = useRouter();
  const { projectName, setProjectName, isDirty } = useStudioStore();
  const [saving, setSaving] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/studio")}
          title="Back to projects"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="h-5 w-px bg-border" />

        {editingName ? (
          <Input
            className="h-7 w-48 text-sm"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingName(false);
            }}
            autoFocus
          />
        ) : (
          <button
            className="max-w-[200px] truncate text-sm font-medium hover:text-primary"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {projectName}
          </button>
        )}

        {isDirty && <span className="text-xs text-muted-foreground">(unsaved)</span>}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={saving || !isDirty}
          title="Save (Ctrl+S)"
        >
          <Save className="mr-1 h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={() => setShowExport(true)}
          title="Export video"
        >
          <Download className="mr-1 h-4 w-4" />
          Export
        </Button>
      </div>

      {showExport && <ExportDialog projectId={projectId} onClose={() => setShowExport(false)} />}
    </>
  );
}
