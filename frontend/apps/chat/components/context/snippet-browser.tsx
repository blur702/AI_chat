"use client";

import { useState, useMemo, useEffect } from "react";
import { Button, Input, ScrollArea } from "@workstation/ui";
import { useSnippets } from "@workstation/api";
import { Search, Plus, Loader2 } from "lucide-react";

interface SnippetBrowserProps {
  onInsert: (content: string) => void;
  refreshKey?: number;
}

export function SnippetBrowser({ onInsert, refreshKey }: SnippetBrowserProps) {
  const { snippets, loading, refresh } = useSnippets();
  const [query, setQuery] = useState("");

  // Re-fetch when refreshKey changes (e.g., after a snippet is created externally)
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      refresh();
    }
  }, [refreshKey, refresh]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const lowerQuery = useMemo(() => query.toLowerCase().trim(), [query]);

  const filtered = useMemo(() => {
    if (!lowerQuery) return snippets;
    return snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.content.toLowerCase().includes(lowerQuery) ||
        s.tags?.some((t) => t.toLowerCase().includes(lowerQuery))
    );
  }, [snippets, lowerQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Snippet browser">
      {/* Search */}
      <div className="px-2 py-1.5 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search snippets..."
            className="h-7 pl-7 text-xs"
            aria-label="Search snippets"
          />
        </div>
      </div>

      {/* Snippet list */}
      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-3">
              {snippets.length === 0 ? "No snippets yet." : "No matches."}
            </p>
          ) : (
            filtered.map((snippet) => {
              const isExpanded = expandedId === snippet.id;
              return (
                <div
                  key={snippet.id}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  className="group rounded-md border p-2 text-xs hover:bg-muted/30 transition-colors focus-within:ring-1 focus-within:ring-ring cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : snippet.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(isExpanded ? null : snippet.id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium truncate">{snippet.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px] shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInsert(snippet.content);
                      }}
                      aria-label={`Insert ${snippet.name}`}
                    >
                      <Plus className="h-3 w-3 mr-0.5" />
                      Insert
                    </Button>
                  </div>
                  {isExpanded ? (
                    <pre className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap break-words max-h-24 overflow-y-auto font-mono">
                      {snippet.content}
                    </pre>
                  ) : (
                    <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
                      {snippet.content.slice(0, 80).trim()}
                      {snippet.content.length > 80 ? "..." : ""}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
