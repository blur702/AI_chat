"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button, cn } from "@workstation/ui";
import { Plus, X, Terminal as TerminalIcon, Circle } from "lucide-react";
import { useAuth } from "@workstation/api/hooks/use-auth";
import { useTerminalWebSocket } from "@workstation/api/hooks/use-terminal-websocket";
import type { TerminalStatus } from "@workstation/api/hooks/use-terminal-websocket";

interface TerminalTab {
  id: string;
  name: string;
  lines: string[];
  input: string;
  running: boolean;
}

export interface TerminalHandle {
  runCommand: (cmd: string) => void;
}

interface TerminalPaneProps {
  projectId: string;
  onCommand?: (command: string) => void;
  handleRef?: React.MutableRefObject<TerminalHandle | null>;
}

function createTab(id: string, name: string): TerminalTab {
  return {
    id,
    name,
    lines: ["$ "],
    input: "",
    running: false,
  };
}

const STATUS_COLORS: Record<TerminalStatus, string> = {
  connected: "text-green-400",
  connecting: "text-yellow-400",
  disconnected: "text-red-400",
  exhausted: "text-red-500",
};

const STATUS_LABELS: Record<TerminalStatus, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
  exhausted: "Connection lost",
};

export function TerminalPane({ projectId, onCommand, handleRef }: TerminalPaneProps) {
  const { token } = useAuth();
  const [tabs, setTabs] = useState<TerminalTab[]>([
    createTab("term-1", "Terminal 1"),
  ]);
  const [activeTab, setActiveTab] = useState("term-1");
  const bottomRef = useRef<HTMLDivElement>(null);
  const tabCounterRef = useRef(1);

  // Track which tab issued the most recent command so output is routed there,
  // even if the user switches tabs while output is still streaming.
  const issuingTabRef = useRef<string>(activeTab);

  const currentTab = tabs.find((t) => t.id === activeTab);

  const updateTabById = useCallback(
    (tabId: string, updater: (tab: TerminalTab) => TerminalTab) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? updater(t) : t))
      );
    },
    []
  );

  const onOutput = useCallback(
    (_stream: string, content: string) => {
      const targetTab = issuingTabRef.current;
      updateTabById(targetTab, (tab) => {
        const newLines = [...tab.lines];
        const promptIdx = Math.max(newLines.length - 1, 0);
        const outputLines = content.split("\n");
        if (outputLines[outputLines.length - 1] === "") {
          outputLines.pop();
        }
        newLines.splice(promptIdx, 0, ...outputLines);
        return { ...tab, lines: newLines };
      });
    },
    [updateTabById]
  );

  const onExit = useCallback(
    (code: number) => {
      const targetTab = issuingTabRef.current;
      updateTabById(targetTab, (tab) => {
        const newLines = [...tab.lines];
        if (code !== 0) {
          const promptIdx = Math.max(newLines.length - 1, 0);
          newLines.splice(promptIdx, 0, `[exit code: ${code}]`);
        }
        return { ...tab, lines: newLines, running: false };
      });
    },
    [updateTabById]
  );

  const onError = useCallback(
    (message: string) => {
      const targetTab = issuingTabRef.current;
      updateTabById(targetTab, (tab) => {
        const newLines = [...tab.lines];
        const promptIdx = newLines.length - 1;
        newLines.splice(promptIdx, 0, `Error: ${message}`);
        return { ...tab, lines: newLines, running: false };
      });
    },
    [updateTabById]
  );

  const { status, sendCommand, connect } = useTerminalWebSocket({
    projectId,
    token,
    onOutput,
    onExit,
    onError,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentTab?.lines.length]);

  const handleCommand = useCallback(
    (cmd: string) => {
      if (!cmd.trim()) return;

      // Handle local-only commands
      if (cmd.trim() === "clear") {
        updateTabById(activeTab, (tab) => ({ ...tab, lines: ["$ "], input: "" }));
        return;
      }

      // Record which tab is issuing this command
      issuingTabRef.current = activeTab;

      // Show the command in the terminal and mark as running
      updateTabById(activeTab, (tab) => {
        const newLines = [...tab.lines];
        newLines[newLines.length - 1] = `$ ${cmd}`;
        newLines.push("$ ");
        return { ...tab, lines: newLines, input: "", running: true };
      });

      // Send to backend
      sendCommand(cmd);

      // Notify parent of the command for context tracking
      onCommand?.(cmd);
    },
    [activeTab, updateTabById, sendCommand, onCommand]
  );

  // Expose handleCommand to parent via ref
  useEffect(() => {
    if (handleRef) {
      handleRef.current = { runCommand: handleCommand };
    }
    return () => {
      if (handleRef) handleRef.current = null;
    };
  }, [handleRef, handleCommand]);

  const addTab = useCallback(() => {
    tabCounterRef.current += 1;
    const id = `term-${crypto.randomUUID()}`;
    const name = `Terminal ${tabCounterRef.current}`;
    setTabs((prev) => [...prev, createTab(id, name)]);
    setActiveTab(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length === 1) return prev;
      const remaining = prev.filter((t) => t.id !== id);
      const newActive = remaining.length > 0 ? remaining[0].id : prev[0].id;
      setActiveTab((currentActive) =>
        currentActive === id ? newActive : currentActive
      );
      // If the closed tab was the issuing tab, redirect output to the new active tab
      if (issuingTabRef.current === id) {
        issuingTabRef.current = newActive;
      }
      return remaining;
    });
  }, []);

  return (
    <div className="flex h-full flex-col bg-[hsl(240,10%,4%)]">
      {/* Terminal tabs + status */}
      <div className="flex items-center border-b border-border/50">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "group flex items-center gap-1.5 border-r border-border/50 px-3 py-1 text-xs cursor-pointer",
              tab.id === activeTab
                ? "bg-[hsl(240,10%,6%)] text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <TerminalIcon className="h-3 w-3" />
            <span>{tab.name}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100"
                aria-label={`Close ${tab.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-1"
          onClick={addTab}
          aria-label="New terminal tab"
        >
          <Plus className="h-3 w-3" />
        </Button>

        {/* Connection status + reconnect */}
        <div className="ml-auto flex items-center gap-1.5 px-3 text-xs">
          <Circle className={cn("h-2 w-2 fill-current", STATUS_COLORS[status])} />
          <span className="text-muted-foreground">{STATUS_LABELS[status]}</span>
          {(status === "disconnected" || status === "exhausted") && (
            <button
              onClick={connect}
              className="ml-1 text-blue-400 hover:text-blue-300 underline"
              aria-label="Reconnect terminal"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Terminal output */}
      {currentTab && (
        <div className="flex-1 overflow-auto p-2 font-mono text-xs text-green-400">
          {status === "exhausted" && (
            <div className="mb-2 flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400">
              <span>Connection lost after multiple retries.</span>
              <button
                onClick={connect}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Reconnect
              </button>
            </div>
          )}
          {currentTab.lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {i === currentTab.lines.length - 1 ? (
                <span>
                  {line}
                  <input
                    value={currentTab.input}
                    onChange={(e) =>
                      updateTabById(activeTab, (t) => ({ ...t, input: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCommand(currentTab.input);
                      }
                    }}
                    className="bg-transparent outline-none text-green-400 caret-green-400"
                    autoFocus
                    disabled={status !== "connected"}
                    aria-label="Terminal command input"
                  />
                </span>
              ) : (
                line
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
