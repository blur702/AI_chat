"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button, Input, ScrollArea } from "@workstation/ui";
import { Loader2, Terminal } from "lucide-react";
import type { DrushCommandResponse } from "@workstation/api/types";

interface DrushEntry {
  id: number;
  command: string;
  output: string;
  exitCode: number;
  error?: string;
}

interface DrushTerminalProps {
  onRunDrush: (command: string) => Promise<void>;
  drushOutput: DrushCommandResponse | null;
  drushRunning: boolean;
}

export function DrushTerminal({
  onRunDrush,
  drushOutput,
  drushRunning,
}: DrushTerminalProps) {
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<DrushEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const entryIdRef = useRef(0);

  // Append output to history when a new result arrives (capped at 100 entries)
  useEffect(() => {
    if (drushOutput) {
      setHistory((prev) => {
        const next = [
          ...prev,
          {
            id: ++entryIdRef.current,
            command: drushOutput.command,
            output: drushOutput.output,
            exitCode: drushOutput.exit_code,
            error: drushOutput.error ?? undefined,
          },
        ];
        return next.length > 100 ? next.slice(-100) : next;
      });
    }
  }, [drushOutput]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = command.trim();
      if (!trimmed || drushRunning) return;
      setCommand("");
      setHistoryIndex(-1);
      await onRunDrush(trimmed);
    },
    [command, drushRunning, onRunDrush]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const cmds = history.map((h) => h.command);
        const newIdx = Math.min(historyIndex + 1, cmds.length - 1);
        setHistoryIndex(newIdx);
        if (cmds.length > 0) {
          setCommand(cmds[cmds.length - 1 - newIdx]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const cmds = history.map((h) => h.command);
        const newIdx = Math.max(historyIndex - 1, -1);
        setHistoryIndex(newIdx);
        setCommand(newIdx < 0 ? "" : cmds[cmds.length - 1 - newIdx]);
      }
    },
    [history, historyIndex]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Command log */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-3 space-y-3 font-mono text-xs">
          {history.length === 0 && (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Terminal className="h-4 w-4" />
              <span>Enter a Drush command below</span>
            </div>
          )}
          {history.map((entry) => (
            <div key={entry.id} className="space-y-1">
              <div className="flex items-center gap-1 text-primary">
                <span className="text-muted-foreground">$</span>
                <span>drush {entry.command}</span>
              </div>
              {entry.output && (
                <pre className="whitespace-pre-wrap text-foreground/80 pl-3">
                  {entry.output}
                </pre>
              )}
              {entry.error && (
                <pre className="whitespace-pre-wrap text-red-500 pl-3">
                  {entry.error}
                </pre>
              )}
              {entry.exitCode !== 0 && (
                <div className="text-[10px] text-red-400 pl-3">
                  exit code: {entry.exitCode}
                </div>
              )}
            </div>
          ))}
          {drushRunning && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Running...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Command input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t px-3 py-2"
      >
        <span className="text-xs text-muted-foreground font-mono">drush</span>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="status, cr, updb..."
          className="flex-1 h-7 text-xs font-mono"
          disabled={drushRunning}
          autoFocus
        />
        <Button
          type="submit"
          size="sm"
          className="h-7 text-xs"
          disabled={drushRunning || !command.trim()}
        >
          {drushRunning ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Run"
          )}
        </Button>
      </form>
    </div>
  );
}
