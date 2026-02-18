"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@workstation/ui";
import {
  ArrowLeft,
  Save,
  Download,
  Monitor,
} from "lucide-react";
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
      <div className="h-12 border-b flex items-center gap-2 px-3 bg-card shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/studio")}
          title="Back to projects"
        >
          <ArrowLeft className="w-4 h-4" />
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
            className="text-sm font-medium hover:text-primary truncate max-w-[200px]"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {projectName}
          </button>
        )}

        {isDirty && (
          <span className="text-xs text-muted-foreground">(unsaved)</span>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={saving || !isDirty}
          title="Save (Ctrl+S)"
        >
          <Save className="w-4 h-4 mr-1" />
          {saving ? "Saving..." : "Save"}
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={() => setShowExport(true)}
          title="Export video"
        >
          <Download className="w-4 h-4 mr-1" />
          Export
        </Button>
      </div>

      {showExport && (
        <ExportDialog
          projectId={projectId}
          onClose={() => setShowExport(false)}
        />
      )}
    </>
  );
}
