"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import {
  Button,
  ScrollArea,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  cn,
} from "@workstation/ui";
import {
  X,
  Send,
  Bot,
  User,
  AlertCircle,
  ListChecks,
  Wrench,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useWorkspaceConversation, useChats } from "@workstation/api/hooks";
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
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [creatingChat, setCreatingChat] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { chats, loading: chatsLoading, createChat } = useChats(projectId);

  const {
    chatId: activeChatId,
    messages,
    loading,
    processing,
    progress,
    error,
    tokenUsage,
    sendMessage,
  } = useWorkspaceConversation(
    projectId,
    {
      selectedFile,
      fileTree,
      terminalHistory,
    },
    selectedChatId,
  );

  // When the hook resolves the default chat, use it for display
  const resolvedChatId = selectedChatId ?? activeChatId;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, processing]);

  // Listen for injected messages from issues panel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.content && sendMessage) {
        sendMessage(detail.content).catch(() => {});
      }
    };
    window.addEventListener("workspace:inject-message", handler);
    return () => window.removeEventListener("workspace:inject-message", handler);
  }, [sendMessage]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || processing) return;
    setInput("");
    try {
      await sendMessage(content);
    } catch {
      // sendMessage handles errors internally via setError
    }
  }, [input, processing, sendMessage]);

  const handleNewChat = useCallback(async () => {
    if (creatingChat) return;
    setCreatingChat(true);
    setCreateError(null);
    try {
      const newId = await createChat("New Chat");
      if (newId) {
        setSelectedChatId(newId);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create chat");
    } finally {
      setCreatingChat(false);
    }
  }, [creatingChat, createChat]);

  const handleSelectChat = useCallback((id: string) => {
    setSelectedChatId(id);
  }, []);

  // Find the title of the active chat
  const activeChatTitle = chats.find((c) => c.id === resolvedChatId)?.title ?? "AI Chat";
  const visibleChats = chats.filter((c) => !c.is_archived);

  return (
    <div className="flex h-full flex-col border-l">
      {/* Header with chat selector */}
      <div className="flex items-center justify-between gap-1 border-b px-2 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors hover:bg-accent"
            >
              <span className="truncate">{activeChatTitle}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {chatsLoading && visibleChats.length === 0 ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : visibleChats.length === 0 ? (
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                No chats yet
              </DropdownMenuLabel>
            ) : (
              visibleChats.map((chat) => (
                <DropdownMenuItem
                  key={chat.id}
                  onSelect={() => handleSelectChat(chat.id)}
                  className={cn("text-xs", chat.id === resolvedChatId && "bg-accent font-medium")}
                >
                  <span className="truncate">{chat.title}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleNewChat} disabled={creatingChat} className="text-xs">
              {creatingChat ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3 w-3" />
              )}
              New Chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onClose}
          aria-label="Close chat panel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Chat creation error */}
      {createError && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{createError}</span>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {loading && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Loading conversation...
            </p>
          )}

          {!loading && messages.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Ask a question about your code to get started.
            </p>
          )}

          {messages.map((msg) => {
            const hasActions = msg.role === "assistant" && /\[ACTION:\w+\]/.test(msg.content);

            return (
              <div key={msg.id} className="flex gap-2">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {msg.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </div>
                <div className="space-y-1.5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                  {hasActions && onShowActions && (
                    <button
                      type="button"
                      onClick={onShowActions}
                      className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 transition-colors hover:bg-primary/10"
                    >
                      <ListChecks className="h-3.5 w-3.5 shrink-0 text-primary" />
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

          {/* Tool Execution Results — workspace-scoped, not per-chat */}
          {toolResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tool Results
              </p>
              {toolResults.slice(0, 3).map((result, i) => (
                <div
                  key={`tool-${i}`}
                  className="flex items-start gap-2 rounded-md border bg-muted/30 px-2.5 py-2"
                >
                  <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      {result.success ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive" />
                      )}
                      <span className="text-xs font-medium">{result.tool}</span>
                      <span className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {result.duration_ms}ms
                      </span>
                    </div>
                    {result.success && result.result && (
                      <pre className="max-h-20 overflow-auto whitespace-pre-wrap rounded bg-background px-1.5 py-1 text-[10px]">
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
      {tokenUsage && tokenUsage.max_tokens > 0 && <SandboxTokenBar tokenUsage={tokenUsage} />}

      {/* Input */}
      <div className="border-t p-2">
        <div className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about your code..."
            disabled={loading || processing}
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button
            size="icon"
            className="h-8 w-8"
            onClick={handleSend}
            disabled={loading || processing || !input.trim()}
            aria-label="Send message"
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
    percentage > 80 ? "bg-red-500" : percentage > 60 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className="px-2 pb-1">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {tokenUsage.current_tokens.toLocaleString()} / {tokenUsage.max_tokens.toLocaleString()} (
          {percentage}%)
        </span>
        {percentage > 80 && <span className="text-[10px] text-red-500">Context nearly full</span>}
      </div>
    </div>
  );
}
