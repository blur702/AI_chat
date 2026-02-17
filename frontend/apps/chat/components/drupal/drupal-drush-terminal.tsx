"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button, Input, cn } from "@workstation/ui";
import { Terminal, Send, Loader2, Trash2 } from "lucide-react";
import type { DrupalLocalDrushResponse } from "@workstation/api/types";

interface Props {
  history: DrupalLocalDrushResponse[];
  loading: boolean;
  onRun: (command: string) => Promise<DrupalLocalDrushResponse>;
}

export function DrupalDrushTerminal({ history, loading, onRun }: Props) {
  const [command, setCommand] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  const handleSubmit = useCallback(async () => {
    const cmd = command.trim();
    if (!cmd || loading) return;
    setCmdHistory((prev) => [...prev, cmd]);
    setHistoryIdx(-1);
    setCommand("");
    try {
      await onRun(cmd);
    } catch {
      // Error is displayed through the history entries from the parent
    }
  }, [command, loading, onRun]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (cmdHistory.length > 0) {
          const idx = historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
          setHistoryIdx(idx);
          setCommand(cmdHistory[idx]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIdx >= 0) {
          const idx = historyIdx + 1;
          if (idx >= cmdHistory.length) {
            setHistoryIdx(-1);
            setCommand("");
          } else {
            setHistoryIdx(idx);
            setCommand(cmdHistory[idx]);
          }
        }
      }
    },
    [handleSubmit, cmdHistory, historyIdx]
  );

  return (
    <div className="flex flex-col h-full bg-zinc-950" role="region" aria-label="Drush Terminal">
      {/* Output */}
      <div ref={outputRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-3">
        {history.length === 0 && (
          <div className="text-zinc-500 flex items-center gap-2">
            <Terminal className="h-4 w-4" aria-hidden="true" />
            <span>Drush terminal ready. Type a command below.</span>
          </div>
        )}
        {history.map((entry, idx) => (
          <div key={idx} className="space-y-1">
            <div className="text-green-400">
              <span className="text-zinc-500">$ drush </span>
              {entry.command}
            </div>
            {entry.stdout && (
              <pre className="text-zinc-300 whitespace-pre-wrap">{entry.stdout}</pre>
            )}
            {entry.stderr && (
              <pre className="text-red-400 whitespace-pre-wrap">{entry.stderr}</pre>
            )}
            {entry.exit_code !== 0 && (
              <div className="text-red-500 text-xs">Exit code: {entry.exit_code}</div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            <span>Running...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-2 border-t border-zinc-800">
        <span className="text-green-400 font-mono text-xs shrink-0" aria-hidden="true">$ drush</span>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="cr, status, pm:list ..."
          className="h-7 text-xs font-mono bg-transparent border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-green-500/30"
          disabled={loading}
          aria-label="Drush command input"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-zinc-800"
          onClick={handleSubmit}
          disabled={loading || !command.trim()}
          aria-label="Run Drush command"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
