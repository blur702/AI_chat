"use client";

import { useState, useCallback } from "react";
import { usePromptPresets } from "@workstation/api/hooks";
import type { PromptPresetResponse } from "@workstation/api/types";
import { useToast } from "../../toast-provider";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";

const PRESET_CATEGORIES = [
  "general",
  "portrait",
  "landscape",
  "abstract",
  "product",
  "concept-art",
  "anime",
  "photo",
] as const;

interface PromptPresetsProps {
  onSelect: (preset: PromptPresetResponse) => void;
  currentPrompt?: string;
  currentNegativePrompt?: string;
  currentWorkflowSettings?: Record<string, unknown>;
}

export function PromptPresets({
  onSelect,
  currentPrompt,
  currentNegativePrompt,
  currentWorkflowSettings,
}: PromptPresetsProps) {
  const { presets, createPreset, deletePreset } = usePromptPresets();
  const { toast } = useToast();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCategory, setSaveCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!saveName.trim() || !currentPrompt?.trim()) return;
    setSaving(true);
    try {
      await createPreset({
        name: saveName.trim(),
        prompt_text: currentPrompt.trim(),
        negative_prompt_text: currentNegativePrompt?.trim() || null,
        category: saveCategory,
        workflow_settings: currentWorkflowSettings || null,
      });
      setSaveDialogOpen(false);
      setSaveName("");
    } catch (err) {
      toast(
        `Failed to save preset: ${err instanceof Error ? err.message : "Please try again."}`,
        "error"
      );
    } finally {
      setSaving(false);
    }
  }, [saveName, saveCategory, currentPrompt, currentNegativePrompt, currentWorkflowSettings, createPreset]);

  // Group presets by category
  const grouped = presets.reduce<Record<string, PromptPresetResponse[]>>((acc, preset) => {
    const cat = preset.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(preset);
    return acc;
  }, {});

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            Load Preset
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
          {presets.length === 0 ? (
            <DropdownMenuItem disabled>No presets saved yet</DropdownMenuItem>
          ) : (
            Object.entries(grouped).map(([category, categoryPresets]) => (
              <div key={category}>
                <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">
                  {category}
                </DropdownMenuLabel>
                {categoryPresets.map((preset) => (
                  <DropdownMenuItem
                    key={preset.id}
                    className="flex items-center justify-between group"
                    onSelect={() => onSelect(preset)}
                  >
                    <span className="truncate flex-1">{preset.name}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 ml-2 text-xs"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete preset "${preset.name}"?`)) {
                          try {
                            await deletePreset(preset.id);
                          } catch (err) {
                            toast(
                              `Failed to delete preset "${preset.name}": ${
                                err instanceof Error ? err.message : "Unknown error"
                              }`,
                              "error"
                            );
                          }
                        }
                      }}
                    >
                      x
                    </button>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </div>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        disabled={!currentPrompt?.trim()}
        onClick={() => setSaveDialogOpen(true)}
      >
        Save Preset
      </Button>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Prompt Preset</DialogTitle>
            <DialogDescription>
              Save your current prompt and settings as a reusable preset.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium inline-flex items-center gap-1.5">
                Name
                <FieldHelp
                  slug="imagegen-preset-name"
                  tip="Preset label shown in the Load Preset menu."
                />
              </label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="My preset name..."
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium inline-flex items-center gap-1.5">
                Category
                <FieldHelp
                  slug="imagegen-preset-category"
                  tip="Grouping used to organize presets in the dropdown."
                />
              </label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={saveCategory}
                onChange={(e) => setSaveCategory(e.target.value)}
              >
                {PRESET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1).replace("-", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-muted-foreground">
              Prompt: {currentPrompt?.slice(0, 80)}
              {(currentPrompt?.length ?? 0) > 80 ? "..." : ""}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !saveName.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
