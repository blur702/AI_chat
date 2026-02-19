"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@workstation/ui";
import { getClient } from "@workstation/api";
import { PromptSelector } from "./prompt-selector";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

interface ChatInstructionsPanelProps {
  chatId: string;
  chatInstructions?: string;
  systemPromptId?: string;
  onSaved?: () => void;
}

export function ChatInstructionsPanel({
  chatId,
  chatInstructions: initialInstructions,
  systemPromptId: initialPromptId,
  onSaved,
}: ChatInstructionsPanelProps) {
  const [instructions, setInstructions] = useState(initialInstructions ?? "");
  const [promptId, setPromptId] = useState<string | undefined>(initialPromptId);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (msgTimerRef.current) clearTimeout(msgTimerRef.current); };
  }, []);

  useEffect(() => {
    setInstructions(initialInstructions ?? "");
    setPromptId(initialPromptId);
  }, [initialInstructions, initialPromptId]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await getClient().updateChat(chatId, {
        chat_instructions: instructions || undefined,
        system_prompt_id: promptId,
      });
      setMsg({ text: "Chat settings saved", type: "success" });
      msgTimerRef.current = setTimeout(() => setMsg(null), 3000);
      onSaved?.();
    } catch {
      setMsg({ text: "Failed to save chat settings", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Chat Instructions</h3>
        <p className="text-xs text-muted-foreground">
          Custom instructions that apply only to this chat. Overrides project-level system prompt.
        </p>
      </div>

      <PromptSelector
        value={promptId}
        onChange={setPromptId}
        label="Chat System Prompt Override"
      />

      <div className="space-y-2">
        <label htmlFor="chat-instructions" className="text-sm font-medium flex items-center gap-1.5">
          Instructions
          <FieldHelp
            slug="chat-instructions"
            tip="Applies guidance only to this chat without changing project defaults."
          />
        </label>
        <textarea
          id="chat-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Additional instructions for this specific chat..."
          rows={4}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[80px]"
        />
        <p className="text-xs text-muted-foreground">
          {instructions.length} characters
        </p>
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

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        Save
      </Button>
    </div>
  );
}
