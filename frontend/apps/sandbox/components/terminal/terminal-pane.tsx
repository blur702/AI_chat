"use client";

import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@workstation/ui";
import { Plus, X, Terminal as TerminalIcon } from "lucide-react";

interface TerminalTab {
  id: string;
  name: string;
}

export function TerminalPane() {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: "term-1", name: "Terminal 1" },
  ]);
  const [activeTab, setActiveTab] = useState("term-1");
  const [lines, setLines] = useState<string[]>([
    "$ Welcome to AI Workstation Terminal",
    "$ Type commands here (WebSocket integration pending)",
    "$ ",
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const handleCommand = (cmd: string) => {
    const newLines = [...lines];
    // Replace the last "$ " prompt with the command
    newLines[newLines.length - 1] = `$ ${cmd}`;

    // Mock command responses
    if (cmd === "help") {
      newLines.push("Available commands: help, clear, echo, date");
    } else if (cmd === "clear") {
      setLines(["$ "]);
      setInput("");
      return;
    } else if (cmd.startsWith("echo ")) {
      newLines.push(cmd.slice(5));
    } else if (cmd === "date") {
      newLines.push(new Date().toString());
    } else if (cmd.trim()) {
      newLines.push(`command not found: ${cmd}`);
    }

    newLines.push("$ ");
    setLines(newLines);
    setInput("");
  };

  const addTab = () => {
    const id = `term-${Date.now()}`;
    setTabs((prev) => [...prev, { id, name: `Terminal ${prev.length + 1}` }]);
    setActiveTab(id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      if (prev.length === 1) return prev;
      const remaining = prev.filter((t) => t.id !== id);
      if (activeTab === id && remaining.length > 0) {
        setActiveTab(remaining[0].id);
      }
      return remaining;
    });
  };

  return (
    <div className="flex h-full flex-col bg-[hsl(240,10%,4%)]">
      {/* Terminal tabs */}
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
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Terminal output */}
      <div className="flex-1 overflow-auto p-2 font-mono text-xs text-green-400">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap">
            {i === lines.length - 1 ? (
              <span>
                {line}
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCommand(input);
                    }
                  }}
                  className="bg-transparent outline-none text-green-400 caret-green-400"
                  autoFocus
                />
              </span>
            ) : (
              line
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
