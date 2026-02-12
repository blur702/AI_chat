"use client";

import { useRef, useEffect, useState } from "react";
import { Button, ScrollArea, cn } from "@workstation/ui";
import { X, Send, Bot, User, AlertCircle, ListChecks, Wrench, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useSandboxConversation } from "@workstation/api/hooks";
import type { TokenUsage } from "@workstation/api/hooks/use-token-usage";
import type { FileNode, ToolExecuteResponse } from "@workstation/api/types";
import { ThinkingIndicator } from "./thinking-indicator";

interface ChatPanelProps {
  projectId: string;
  selectedFile: string | null;
  fileTree: FileNode[] | null;
  terminalHistory: string[];
  onClose: () => void;
  onShowActions?: () => void;
  toolResults?: ToolExecuteResponse[];
}

export function ChatPanel({
  projectId,
  selectedFile,
  fileTree,
  terminalHistory,
  onClose,
  onShowActions,
  toolResults = [],
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, loading, processing, progress, error, tokenUsage, sendMessage } =
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

          {/* Tool Execution Results */}
          {toolResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Tool Results
              </p>
              {toolResults.slice(0, 3).map((result, i) => (
                <div
                  key={`tool-${i}`}
                  className="flex items-start gap-2 rounded-md border bg-muted/30 px-2.5 py-2"
                >
                  <Wrench className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      {result.success ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive" />
                      )}
                      <span className="text-xs font-medium">{result.tool}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto">
                        <Clock className="h-2.5 w-2.5" />
                        {result.duration_ms}ms
                      </span>
                    </div>
                    {result.success && result.result && (
                      <pre className="text-[10px] bg-background rounded px-1.5 py-1 overflow-auto max-h-20 whitespace-pre-wrap">
                        {JSON.stringify(result.result, null, 2)}
                      </pre>
                    )}
                    {!result.success && result.error && (
                      <p className="text-[10px] text-destructive">{result.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Token Usage */}
      {tokenUsage && tokenUsage.max_tokens > 0 && (
        <SandboxTokenBar tokenUsage={tokenUsage} />
      )}

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

function SandboxTokenBar({ tokenUsage }: { tokenUsage: TokenUsage }) {
  const percentage = Math.round(tokenUsage.usage_ratio * 100);
  const barColor =
    percentage > 80
      ? "bg-red-500"
      : percentage > 60
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div className="px-2 pb-1">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[10px] text-muted-foreground">
          {tokenUsage.current_tokens.toLocaleString()} / {tokenUsage.max_tokens.toLocaleString()} ({percentage}%)
        </span>
        {percentage > 80 && (
          <span className="text-[10px] text-red-500">Context nearly full</span>
        )}
      </div>
    </div>
  );
}
