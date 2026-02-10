"use client";

import { useRef, useEffect, useState } from "react";
import { Button, ScrollArea, cn } from "@workstation/ui";
import { X, Send, Bot, User, AlertCircle, ListChecks } from "lucide-react";
import { useSandboxConversation } from "@workstation/api/hooks";
import type { FileNode } from "@workstation/api/types";
import { ThinkingIndicator } from "./thinking-indicator";

interface ChatPanelProps {
  projectId: string;
  selectedFile: string | null;
  fileTree: FileNode[] | null;
  terminalHistory: string[];
  onClose: () => void;
  onShowActions?: () => void;
}

export function ChatPanel({
  projectId,
  selectedFile,
  fileTree,
  terminalHistory,
  onClose,
  onShowActions,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, loading, processing, progress, error, sendMessage } =
    useSandboxConversation(projectId, {
      selectedFile,
      fileTree,
      terminalHistory,
    });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, processing]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || processing) return;
    setInput("");
    await sendMessage(content);
  };

  return (
    <div className="flex h-full flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase">AI Chat</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {loading && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Loading conversation...
            </p>
          )}

          {!loading && messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Ask a question about your code to get started.
            </p>
          )}

          {messages.map((msg) => {
            const hasActions =
              msg.role === "assistant" &&
              /\[ACTION:\w+\]/.test(msg.content);

            return (
              <div key={msg.id} className="flex gap-2">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {msg.role === "user" ? (
                    <User className="h-3 w-3" />
                  ) : (
                    <Bot className="h-3 w-3" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                  {hasActions && onShowActions && (
                    <button
                      type="button"
                      onClick={onShowActions}
                      className="flex items-center gap-1.5 rounded-md bg-primary/5 border border-primary/20 px-2 py-1 hover:bg-primary/10 transition-colors cursor-pointer w-full"
                    >
                      <ListChecks className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-[10px] text-primary">
                        Actions proposed — click to review in Actions panel
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {processing && <ThinkingIndicator progress={progress} />}

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-2">
        <div className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask about your code..."
            disabled={loading || processing}
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button
            size="icon"
            className="h-8 w-8"
            onClick={handleSend}
            disabled={loading || processing || !input.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
