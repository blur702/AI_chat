"use client";

import { useId } from "react";
import { useSystemPrompts } from "@workstation/api";
import { Loader2 } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

interface PromptSelectorProps {
  value: string | undefined;
  onChange: (promptId: string | undefined) => void;
  label?: string;
}

export function PromptSelector({ value, onChange, label = "System Prompt" }: PromptSelectorProps) {
  const { prompts, loading } = useSystemPrompts();
  const selectId = useId();

  return (
    <div className="space-y-2">
      <label htmlFor={selectId} className="text-sm font-medium inline-flex items-center gap-1.5">
        {label}
        <FieldHelp
          slug="settings-system-prompt"
          tip="Select a reusable system prompt to control assistant behavior."
        />
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          disabled={loading}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <option value="">None (use default)</option>
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.is_default ? " (default)" : ""}
            </option>
          ))}
        </select>
        {loading && (
          <Loader2 className="absolute right-8 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
