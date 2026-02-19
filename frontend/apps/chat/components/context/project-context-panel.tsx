"use client";

import { useState, useEffect, useRef } from "react";
import { Button, Input } from "@workstation/ui";
import { useProject } from "@workstation/api";
import { PromptSelector } from "./prompt-selector";
import { Loader2, Plus, X, Check, AlertCircle } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

interface ProjectContextPanelProps {
  projectId: string;
}

export function ProjectContextPanel({ projectId }: ProjectContextPanelProps) {
  const { project, loading, updateProject } = useProject(projectId);

  const [customContext, setCustomContext] = useState("");
  const [importantFiles, setImportantFiles] = useState<string[]>([]);
  const [systemPromptId, setSystemPromptId] = useState<string | undefined>();
  const [newFile, setNewFile] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (msgTimerRef.current) clearTimeout(msgTimerRef.current); };
  }, []);

  useEffect(() => {
    if (project) {
      setCustomContext(project.custom_context ?? "");
      setImportantFiles(project.important_files ?? []);
      setSystemPromptId(project.system_prompt_id);
    }
  }, [project]);

  const addFile = () => {
    const trimmed = newFile.trim();
    if (trimmed && !importantFiles.includes(trimmed)) {
      setImportantFiles([...importantFiles, trimmed]);
      setNewFile("");
    }
  };

  const removeFile = (path: string) => {
    setImportantFiles(importantFiles.filter((f) => f !== path));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const ok = await updateProject({
        custom_context: customContext || undefined,
        important_files: importantFiles.length > 0 ? importantFiles : undefined,
        system_prompt_id: systemPromptId,
      });
      if (ok) {
        setMsg({ text: "Project context saved", type: "success" });
        msgTimerRef.current = setTimeout(() => setMsg(null), 3000);
      } else {
        setMsg({ text: "Failed to save project context", type: "error" });
      }
    } catch {
      setMsg({ text: "Failed to save project context", type: "error" });
    } finally {
      setSaving(false);
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
      <div>
        <h3 className="text-sm font-semibold">Project Context</h3>
        <p className="text-xs text-muted-foreground">
          Configure context that applies to all chats in this project.
        </p>
      </div>

      <PromptSelector
        value={systemPromptId}
        onChange={setSystemPromptId}
        label="Project System Prompt"
      />

      <div className="space-y-2">
        <label htmlFor="custom-context" className="text-sm font-medium flex items-center gap-1.5">
          Custom Context
          <FieldHelp
            slug="workspace-context"
            tip="Shared guidance included across chats in this project."
          />
        </label>
        <textarea
          id="custom-context"
          value={customContext}
          onChange={(e) => setCustomContext(e.target.value)}
          placeholder="Describe the project, its tech stack, coding conventions..."
          rows={5}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[100px]"
        />
        <p className="text-xs text-muted-foreground">
          {customContext.length} characters
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium inline-flex items-center gap-1.5">
          Important Files
          <FieldHelp
            slug="workspace-files"
            tip="Pin files that should always be considered by AI context tools."
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Files that should always be considered in context.
        </p>

        <div className="flex gap-2">
          <Input
            value={newFile}
            onChange={(e) => setNewFile(e.target.value)}
            placeholder="e.g. src/config.ts"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFile();
              }
            }}
          />
          <Button size="sm" variant="outline" onClick={addFile} disabled={!newFile.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {importantFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {importantFiles.map((file) => (
              <span
                key={file}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-mono"
              >
                {file}
                <button
                  onClick={() => removeFile(file)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove file ${file}`}
                  title={`Remove file ${file}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
            msg.type === "success"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {msg.type === "success" ? (
            <Check className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {msg.text}
        </div>
      )}

      <Button onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        Save Project Context
      </Button>
    </div>
  );
}
