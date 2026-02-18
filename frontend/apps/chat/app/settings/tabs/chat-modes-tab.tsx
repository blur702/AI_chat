"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LoadingButton,
  StatusMessage,
  Button,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Textarea,
} from "@workstation/ui";
import { CHAT_MODES } from "@workstation/api/hooks";
import { Bot, Code, Map as MapIcon, HelpCircle, MessageCircle, ChevronDown, RotateCcw, Eye, EyeOff } from "lucide-react";
import { MODE_PROMPT_DEFAULTS } from "@/lib/mode-prompt-defaults";
import type { UserPreferences } from "@workstation/api/types";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  Code,
  Map: MapIcon,
  HelpCircle,
  MessageCircle,
};

interface ChatModesTabProps {
  preferences: UserPreferences | null;
  updatePreferences: (data: Partial<UserPreferences>) => Promise<{ success: boolean; error?: string }>;
  preferencesSaving: boolean;
}

export function ChatModesTab({ preferences, updatePreferences, preferencesSaving }: ChatModesTabProps) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [showDefault, setShowDefault] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (preferences?.mode_prompt_overrides) {
      setOverrides({ ...preferences.mode_prompt_overrides });
    }
  }, [preferences]);

  const handleChange = useCallback((mode: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [mode]: value }));
  }, []);

  const handleReset = useCallback((mode: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[mode];
      return next;
    });
  }, []);

  const toggleDefault = useCallback((mode: string) => {
    setShowDefault((prev) => ({ ...prev, [mode]: !prev[mode] }));
  }, []);

  const handleSave = async () => {
    setMsg(null);
    // Strip empty values before saving
    const cleaned: Record<string, string> = {};
    for (const [key, val] of Object.entries(overrides)) {
      if (val.trim()) {
        cleaned[key] = val;
      }
    }
    const result = await updatePreferences({
      mode_prompt_overrides: Object.keys(cleaned).length > 0 ? cleaned : undefined,
    });
    if (result.success) {
      setMsg({ text: "Chat mode prompts saved", type: "success" });
    } else {
      setMsg({ text: result.error ?? "Failed to save", type: "error" });
    }
  };

  return (
    <div className="space-y-6 pt-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Chat Modes</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Customize the system prompt modifier for each chat mode. Leave empty to use the built-in default.
        </p>
      </div>

      <div className="space-y-3">
        {CHAT_MODES.map((mode) => {
          const Icon = ICON_MAP[mode.icon];
          const hasOverride = Boolean(overrides[mode.key]?.trim());
          const defaultPrompt = MODE_PROMPT_DEFAULTS[mode.key] || "";
          const isShowingDefault = showDefault[mode.key];

          return (
            <Collapsible key={mode.key}>
              <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{mode.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{mode.description}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {hasOverride && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      Custom
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent className="px-4 pb-4 pt-2 border-x border-b rounded-b-lg -mt-px space-y-3">
                {mode.key === "agent" && !hasOverride ? (
                  <p className="text-xs text-muted-foreground italic">
                    Full Agent mode uses no modifier by default — the base system prompt is used as-is.
                  </p>
                ) : null}

                <Textarea
                  value={overrides[mode.key] ?? ""}
                  onChange={(e) => handleChange(mode.key, e.target.value)}
                  placeholder={
                    mode.key === "agent"
                      ? "No modifier (optional — add one to prepend to the base prompt)"
                      : "Enter custom prompt modifier..."
                  }
                  rows={6}
                  className="font-mono text-xs"
                />

                <div className="flex items-center gap-2">
                  {defaultPrompt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => toggleDefault(mode.key)}
                    >
                      {isShowingDefault ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                      {isShowingDefault ? "Hide Default" : "View Default"}
                    </Button>
                  )}
                  {hasOverride && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => handleReset(mode.key)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset to Default
                    </Button>
                  )}
                </div>

                {isShowingDefault && defaultPrompt && (
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Built-in Default
                    </p>
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono leading-relaxed">
                      {defaultPrompt}
                    </pre>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {msg && <StatusMessage message={msg.text} type={msg.type} />}

      <LoadingButton onClick={handleSave} loading={preferencesSaving}>
        Save Chat Mode Prompts
      </LoadingButton>
    </div>
  );
}
