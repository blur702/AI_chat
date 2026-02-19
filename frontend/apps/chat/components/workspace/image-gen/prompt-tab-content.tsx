"use client";

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Tabs, TabsList, TabsTrigger } from "@workstation/ui";
import { ChevronDown, Loader2 } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";
import { PromptPresets } from "./prompt-presets";
import type { PromptPresetResponse, WorkflowType } from "@workstation/api/types";

interface PromptTabContentProps {
  workflowType: WorkflowType;
  onWorkflowChange: (value: WorkflowType) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (value: string) => void;
  promptError?: string;
  negativePromptError?: string;
  onPresetSelect: (preset: PromptPresetResponse) => void;
  currentWorkflowSettings: Record<string, unknown>;
  // Project system context
  showProjectContext: boolean;
  projectSystemContextInput: string;
  onProjectSystemContextChange: (value: string) => void;
  onSaveProjectContext: () => void;
  projectSystemContextSaving: boolean;
  projectSystemContextMsg: { text: string; type: "success" | "error" } | null;
}

export function PromptTabContent({
  workflowType,
  onWorkflowChange,
  prompt,
  onPromptChange,
  negativePrompt,
  onNegativePromptChange,
  promptError,
  negativePromptError,
  onPresetSelect,
  currentWorkflowSettings,
  showProjectContext,
  projectSystemContextInput,
  onProjectSystemContextChange,
  onSaveProjectContext,
  projectSystemContextSaving,
  projectSystemContextMsg,
}: PromptTabContentProps) {
  return (
    <div className="space-y-4">
      {/* Workflow selector */}
      <div>
        <label className="text-xs font-medium flex items-center gap-1 mb-1.5">
          Workflow{" "}
          <FieldHelp slug="imagegen-workflow" tip="Selects the generation pipeline. Text-to-Image creates from a prompt alone; Img2Img transforms an existing image; Inpaint edits masked regions; Face Morph blends facial features between two images." />
        </label>
        <Tabs value={workflowType} onValueChange={(value) => onWorkflowChange(value as WorkflowType)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="text-to-image">Text</TabsTrigger>
            <TabsTrigger value="image-to-image">Img2Img</TabsTrigger>
            <TabsTrigger value="inpainting">Inpaint</TabsTrigger>
            <TabsTrigger value="face-morph">Face Morph</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <PromptPresets
        onSelect={onPresetSelect}
        currentPrompt={prompt}
        currentNegativePrompt={negativePrompt}
        currentWorkflowSettings={currentWorkflowSettings}
      />

      {/* Prompt */}
      <div>
        <label htmlFor="prompt-input" className="text-xs font-medium flex items-center gap-1">
          Prompt <FieldHelp slug="imagegen-prompt" tip="Describe the image you want to generate. Be specific about subject, style, lighting, and composition. Comma-separated tags (e.g. 'cinematic lighting, 8k, detailed') often improve results." />
        </label>
        <textarea
          id="prompt-input"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          className="mt-1 min-h-[88px] w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Describe the image you want to generate..."
          maxLength={2000}
          required
        />
        <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
          <span>Required</span>
          <span>{prompt.length}/2000</span>
        </div>
        {promptError && <p className="text-[11px] text-destructive mt-1">{promptError}</p>}
      </div>

      {/* Negative prompt */}
      <div>
        <label htmlFor="negative-prompt-input" className="text-xs font-medium flex items-center gap-1">
          Negative Prompt <FieldHelp slug="imagegen-negative-prompt" tip="Lists elements the model should avoid. Common entries include 'blurry, low quality, watermark, deformed hands'. The model reduces the probability of these concepts during generation." />
        </label>
        <textarea
          id="negative-prompt-input"
          value={negativePrompt}
          onChange={(e) => onNegativePromptChange(e.target.value)}
          className="mt-1 min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Optional: what to avoid in the generated image"
          maxLength={2000}
        />
        <div className="text-[11px] text-muted-foreground mt-1 text-right">{negativePrompt.length}/2000</div>
        {negativePromptError && <p className="text-[11px] text-destructive mt-1">{negativePromptError}</p>}
      </div>

      {/* Project System Context (collapsible) */}
      {showProjectContext && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border p-3 text-xs font-medium hover:bg-muted/50"
            >
              <span className="flex items-center gap-1">
                Project Image Context{" "}
                <FieldHelp slug="imagegen-project-system-context" tip="Persistent project-level instructions that are automatically prepended to every image generation prompt in this project. Use this for consistent style rules, quality settings, or brand guidelines." />
              </span>
              <ChevronDown className="h-3.5 w-3.5 transition-transform [[data-state=open]>&]:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-b-md border border-t-0 p-3 space-y-2">
              <textarea
                value={projectSystemContextInput}
                onChange={(e) => onProjectSystemContextChange(e.target.value)}
                className="min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Optional project-level image instructions (style, composition, quality rules)"
                maxLength={4000}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{projectSystemContextInput.length}/4000</span>
                <Button type="button" size="sm" variant="outline" onClick={onSaveProjectContext} disabled={projectSystemContextSaving}>
                  {projectSystemContextSaving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Save project context
                </Button>
              </div>
              {projectSystemContextMsg && (
                <p className={`text-[11px] ${projectSystemContextMsg.type === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                  {projectSystemContextMsg.text}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
