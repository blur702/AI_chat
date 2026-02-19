"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Textarea, Badge } from "@workstation/ui";
import { Terminal, X, Send, Globe, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { getClient } from "@workstation/api";
import type { ClaudeCodeMessage } from "@workstation/api/types";
import { useClaudeCode } from "./claude-code-provider";
import {
  installConsoleCapture,
  getCapturedLogs,
  clearCapturedLogs,
  formatLogsForClipboard,
} from "./console-capture";

export function ClaudeCodeModal() {
  const { isOpen, closePanel } = useClaudeCode();

  useEffect(() => {
    installConsoleCapture();
  }, []);

  if (!isOpen) return null;

  return createPortal(<ClaudeCodeChat closePanel={closePanel} />, document.body);
}

const POLL_INTERVAL = 3000;

function ClaudeCodeChat({ closePanel }: Readonly<{ closePanel: () => void }>) {
  const [messages, setMessages] = useState<ClaudeCodeMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachUrl, setAttachUrl] = useState(false);
  const [attachLogs, setAttachLogs] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Load messages on mount and poll for new ones
  const loadMessages = useCallback(async () => {
    try {
      const res = await getClient().listClaudeCodeMessages();
      setMessages(res.messages);
    } catch {
      // silent - might be offline
    }
  }, []);

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Focus textarea
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [closePanel]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [closePanel]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text && !attachUrl && !attachLogs) return;

    setSending(true);
    try {
      const parts: string[] = [];
      if (text) parts.push(text);

      const pageUrl = attachUrl ? window.location.href : undefined;
      let consoleLogs: string | undefined;

      if (attachLogs) {
        const logs = getCapturedLogs();
        if (logs.length > 0) {
          consoleLogs = formatLogsForClipboard(logs);
        }
      }

      if (pageUrl) {
        parts.push(`**Page URL:** ${pageUrl}`);
      }
      if (consoleLogs) {
        parts.push("**Console Errors:**\n```\n" + consoleLogs + "\n```");
      }

      const content = parts.join("\n\n");

      const msg = await getClient().sendClaudeCodeMessage({
        content,
        role: "user",
        page_url: pageUrl ?? null,
        console_logs: consoleLogs ?? null,
      });

      setMessages((prev) => [...prev, msg]);
      setDraft("");
      setAttachUrl(false);
      setAttachLogs(false);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  }, [draft, attachUrl, attachLogs]);

  // Ctrl+Enter to send
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleClear = useCallback(async () => {
    try {
      await getClient().clearClaudeCodeMessages();
      setMessages([]);
    } catch {
      // silent
    }
  }, []);

  const currentLogCount = getCapturedLogs().length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pr-3 pt-12">
      <div className="fixed inset-0 bg-black/20" aria-hidden="true" />

      <div
        ref={panelRef}
        className="relative z-50 flex h-[calc(100vh-4rem)] max-h-[700px] w-[420px] flex-col rounded-lg border bg-background shadow-lg duration-200 animate-in fade-in-0 slide-in-from-right-2"
        role="dialog"
        aria-label="Claude Code Chat"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Claude Code</h2>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              Live
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleClear}
              title="Clear chat"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={closePanel}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Terminal className="mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Send a message to Claude Code</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Describe bugs, attach page URL and console errors.
                <br />
                Messages appear directly in the Claude Code session.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                <div className="whitespace-pre-wrap break-words text-[13px]">{msg.content}</div>
                {msg.created_at && (
                  <div
                    className={`mt-1 text-[10px] ${
                      msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="space-y-2 border-t p-3">
          {/* Attach buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant={attachUrl ? "secondary" : "outline"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setAttachUrl(!attachUrl)}
            >
              <Globe className="mr-1 h-3 w-3" />
              {attachUrl ? "URL attached" : "Page URL"}
            </Button>
            <Button
              variant={attachLogs ? "secondary" : "outline"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setAttachLogs(!attachLogs)}
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              {attachLogs ? `Logs (${currentLogCount})` : "Console Errors"}
            </Button>
            {attachLogs && currentLogCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px]"
                onClick={() => clearCapturedLogs()}
                title="Clear captured logs"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Textarea + send */}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the bug..."
              className="max-h-[120px] min-h-[60px] flex-1 resize-none text-sm"
              rows={2}
            />
            <Button
              size="icon"
              className="h-[60px] w-10 shrink-0"
              onClick={handleSend}
              disabled={sending || (!draft.trim() && !attachUrl && !attachLogs)}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Ctrl+Enter to send. Messages poll every 3s.
          </p>
        </div>
      </div>
    </div>
  );
}
