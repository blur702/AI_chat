"use client";

import { useState, useRef, useCallback } from "react";
import { Button, cn } from "@workstation/ui";
import { Send, Square } from "lucide-react";

interface MessageInputProps {
  onSend: (content: string) => void | Promise<void> | Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
  processing?: boolean;
  onStop?: () => void;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  processing = false,
  onStop,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    await onSend(trimmed);
    textareaRef.current?.focus();
  }, [value, disabled, onSend]);

  const handleStop = useCallback(() => {
    onStop?.();
    textareaRef.current?.focus();
  }, [onStop]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && processing) {
      e.preventDefault();
      handleStop();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t p-4">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          aria-label="Message input"
          aria-describedby="message-input-hint"
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-lg border bg-background px-4 py-3 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "min-h-[44px] max-h-[200px]"
          )}
          style={{
            height: "auto",
            minHeight: "44px",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 200) + "px";
          }}
        />
        {processing ? (
          <Button
            onClick={handleStop}
            size="icon"
            variant="destructive"
            aria-label="Stop generating"
            className="h-11 w-11 shrink-0"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            size="icon"
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            className="h-11 w-11 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p id="message-input-hint" className="mt-2 text-xs text-muted-foreground">
        {processing
          ? "Press Escape to stop generating"
          : "Press Enter to send, Shift+Enter for new line"}
      </p>
    </div>
  );
}
