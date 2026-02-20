"use client";

import { useState, useEffect } from "react";
import { LoadingButton, StatusMessage } from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";
import { useSystemPrompts } from "@workstation/api/hooks";
import type { UserPreferences } from "@workstation/api/types";

interface AiPreferencesTabProps {
  preferences: UserPreferences | null;
  updatePreferences: (data: Partial<UserPreferences>) => Promise<{ success: boolean; error?: string }>;
  preferencesSaving: boolean;
  models: { name: string }[] | null;
  modelsLoading: boolean;
}

export function AiPreferencesTab({
  preferences,
  updatePreferences,
  preferencesSaving,
  models,
  modelsLoading,
}: AiPreferencesTabProps) {
  const [defaultModel, setDefaultModel] = useState("");
  const [defaultTemperature, setDefaultTemperature] = useState(0.7);
  const [defaultNumCtx, setDefaultNumCtx] = useState(4096);
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const { prompts } = useSystemPrompts();
  const defaultPrompt = prompts.find((p) => p.is_default);

  useEffect(() => {
    if (preferences) {
      setDefaultModel(preferences.default_model ?? "");
      setDefaultTemperature(preferences.default_temperature ?? 0.7);
      setDefaultNumCtx(preferences.default_num_ctx ?? 4096);
      setCustomSystemPrompt(preferences.custom_system_prompt ?? "");
    }
  }, [preferences]);

  const handleSave = async () => {
    setMsg(null);
    const result = await updatePreferences({
      default_model: defaultModel || undefined,
      default_temperature: defaultTemperature,
      default_num_ctx: defaultNumCtx,
      custom_system_prompt: customSystemPrompt || undefined,
    });
    if (result.success) {
      setMsg({ text: "AI preferences saved", type: "success" });
    } else {
      setMsg({ text: result.error ?? "Failed to save AI preferences", type: "error" });
    }
  };

  return (
    <div className="space-y-6 pt-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">AI Preferences</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Configure default model, temperature, and system prompt for AI responses.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="defaultModel" className="text-sm font-medium flex items-center gap-1.5">
            Default Model
            <FieldHelp slug="settings-default-model" tip="The model used for all new conversations. For example, llama3:8b for fast general chat, or a 70B model for deeper reasoning. Override per-chat as needed." />
          </label>
          <select
            id="defaultModel"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            className="flex h-11 w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Auto (first available)</option>
            {modelsLoading ? (
              <option disabled>Loading models...</option>
            ) : (
              (models ?? []).map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="temperature" className="text-sm font-medium flex items-center gap-1.5">
            Temperature: {defaultTemperature.toFixed(2)}
            <FieldHelp slug="settings-default-temperature" tip="Use 0.1-0.3 for code and precise tasks, 0.6-0.8 for brainstorming and creative writing. For example, 0.1 gives consistent code reviews while 0.8 yields diverse story ideas." />
          </label>
          <input
            id="temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={defaultTemperature}
            onChange={(e) => setDefaultTemperature(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Precise (0.0)</span>
            <span>Creative (1.0)</span>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="numCtx" className="text-sm font-medium flex items-center gap-1.5">
            Context Window: {defaultNumCtx >= 1024 ? `${Math.round(defaultNumCtx / 1024)}K` : defaultNumCtx.toLocaleString()} tokens
            <FieldHelp slug="settings-default-num-ctx" tip="How many tokens of conversation history the model can see. For example, 4096 for quick chats or 32K+ for long planning sessions. Higher values use more VRAM." />
          </label>
          <input
            id="numCtx"
            type="range"
            min="512"
            max="131072"
            step="512"
            value={defaultNumCtx}
            onChange={(e) => setDefaultNumCtx(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>512</span>
            <span>128K</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Controls how much conversation history the model can see. Higher values use more VRAM.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="systemPrompt" className="text-sm font-medium flex items-center gap-1.5">
            Custom System Prompt
            <FieldHelp slug="settings-system-prompt" tip="Hidden instructions sent at the start of every new chat. For example, 'You are a senior engineer. Always suggest test cases.' shapes all responses toward engineering rigor." />
          </label>
          <textarea
            id="systemPrompt"
            value={customSystemPrompt}
            onChange={(e) => setCustomSystemPrompt(e.target.value)}
            placeholder="You are a helpful AI assistant..."
            rows={5}
            className="flex w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[100px]"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to use the default system prompt.
          </p>
          {defaultPrompt && !customSystemPrompt && (
            <div className="rounded-md border bg-muted/30 p-3 mt-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium">Default: {defaultPrompt.name}</span>
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                {defaultPrompt.content}
              </p>
            </div>
          )}
        </div>
      </div>

      {msg && <StatusMessage message={msg.text} type={msg.type} />}

      <LoadingButton onClick={handleSave} loading={preferencesSaving}>
        Save AI Preferences
      </LoadingButton>
    </div>
  );
}
