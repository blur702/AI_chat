"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Button, Badge } from "@workstation/ui";
import {
  Trash2,
  Loader2,
  Eye,
  WrapText,
  Hash,
  Highlighter,
} from "lucide-react";
import { estimateTokens, getTokenColor } from "./context-utils";
import type { TokenizeResponse } from "@workstation/api";
import { getClient } from "@workstation/api";

export interface MarkdownEditorProps {
  content: string;
  readOnly: boolean;
  searchQuery: string;
  onChange: (content: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  gutterRef?: React.RefObject<HTMLDivElement | null>;
}

export function MarkdownEditor({ content, readOnly, searchQuery, onChange, textareaRef: externalRef, gutterRef: externalGutterRef }: MarkdownEditorProps) {
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [wordWrap, setWordWrap] = useState(true);
  const [tokenHighlight, setTokenHighlight] = useState(false);
  const [tokenData, setTokenData] = useState<TokenizeResponse | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const tokenCacheRef = useRef<{ hash: string; data: TokenizeResponse } | null>(null);
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const internalGutterRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = externalRef ?? internalRef;
  const gutterRef = externalGutterRef ?? internalGutterRef;

  const lines = useMemo(() => content.split("\n"), [content]);
  const lowerQuery = searchQuery.toLowerCase();

  // Simple hash for caching
  const contentHash = useMemo(() => {
    let h = 0;
    for (let i = 0; i < content.length; i++) {
      h = ((h << 5) - h + content.charCodeAt(i)) | 0;
    }
    return String(h);
  }, [content]);

  const fetchTokenization = useCallback(async () => {
    if (!content) return;
    // Check cache
    if (tokenCacheRef.current?.hash === contentHash) {
      setTokenData(tokenCacheRef.current.data);
      return;
    }
    setTokenLoading(true);
    try {
      const client = getClient();
      const result = await client.tokenizeText(content);
      tokenCacheRef.current = { hash: contentHash, data: result };
      setTokenData(result);
    } catch {
      setTokenData(null);
    } finally {
      setTokenLoading(false);
    }
  }, [content, contentHash]);

  const handleToggleTokenize = useCallback(() => {
    if (tokenHighlight) {
      setTokenHighlight(false);
      return;
    }
    setTokenHighlight(true);
    fetchTokenization();
  }, [tokenHighlight, fetchTokenization]);

  const toggleLine = (lineIdx: number) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineIdx)) {
        next.delete(lineIdx);
      } else {
        next.add(lineIdx);
      }
      return next;
    });
  };

  const deleteSelectedLines = () => {
    const remaining = lines.filter((_, idx) => !selectedLines.has(idx));
    onChange(remaining.join("\n"));
    setSelectedLines(new Set());
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const tokenCount = estimateTokens(content);

  // Can show token highlight in read-only or combined view
  const canTokenize = readOnly && content.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-2 py-1.5 bg-muted/30">
        <div className="flex items-center gap-1.5">
          {!readOnly && selectedLines.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[10px] px-2"
              onClick={deleteSelectedLines}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete {selectedLines.size} line{selectedLines.size > 1 ? "s" : ""}
            </Button>
          )}
          {readOnly && !tokenHighlight && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Eye className="h-3 w-3" />
              Read-only
            </div>
          )}
          {tokenHighlight && tokenData && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Highlighter className="h-3 w-3" />
              Token view
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canTokenize && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={handleToggleTokenize}
              disabled={tokenLoading}
              title={tokenHighlight ? "Hide token highlights" : "Show token highlights"}
            >
              {tokenLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Highlighter className={`h-3 w-3 ${tokenHighlight ? "text-primary" : "text-muted-foreground"}`} />
              )}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setWordWrap(!wordWrap)}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          >
            <WrapText className={`h-3 w-3 ${wordWrap ? "text-foreground" : "text-muted-foreground"}`} />
          </Button>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 tabular-nums">
            <Hash className="h-2.5 w-2.5 mr-0.5" />
            {tokenCount.toLocaleString()} tokens
          </Badge>
        </div>
      </div>

      {/* Editor body */}
      {readOnly && tokenHighlight && tokenData ? (
        /* Token-highlighted read-only view */
        <div className="flex-1 overflow-auto">
          <pre className={`p-2 text-xs font-mono leading-[20px] ${wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>
            {tokenData.tokens.map((span, idx) => (
              <span
                key={idx}
                className={`${getTokenColor(idx)} rounded-sm`}
                title={`Token ${idx + 1}: "${span.text}" (${span.end - span.start} chars)`}
              >
                {span.text}
              </span>
            ))}
          </pre>
        </div>
      ) : readOnly ? (
        /* Read-only: single scroll container for gutter + content sync */
        <div className="flex-1 overflow-auto">
          <div className="flex">
            <div className="shrink-0 border-r bg-muted/20 select-none sticky left-0" style={{ minWidth: 40 }}>
              {lines.map((line, idx) => {
                const isHighlighted = lowerQuery && line.toLowerCase().includes(lowerQuery);
                return (
                  <div
                    key={`line-${idx}`}
                    className={`px-1 text-[10px] text-muted-foreground leading-[20px] ${
                      isHighlighted ? "bg-yellow-500/20" : ""
                    }`}
                  >
                    <span className="tabular-nums text-right block" style={{ minWidth: 24 }}>
                      {idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>
            <pre
              className={`flex-1 p-2 text-xs font-mono leading-[20px] ${wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
            >
              {lines.map((line, idx) => {
                const isHighlighted = lowerQuery && line.toLowerCase().includes(lowerQuery);
                return (
                  <div key={`content-${idx}`} className={isHighlighted ? "bg-yellow-500/20" : ""}>
                    {renderMarkdownLine(line)}
                  </div>
                );
              })}
            </pre>
          </div>
        </div>
      ) : (
        /* Edit mode: separate gutter synced via onScroll */
        <div className="flex flex-1 overflow-hidden">
          <div
            ref={(el) => { (gutterRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }}
            className="shrink-0 border-r bg-muted/20 overflow-y-hidden select-none"
            style={{ minWidth: 60 }}
          >
            {lines.map((line, idx) => {
              const isHighlighted = lowerQuery && line.toLowerCase().includes(lowerQuery);
              return (
                <div
                  key={`line-${idx}`}
                  className={`flex items-center gap-0.5 px-1 text-[10px] text-muted-foreground leading-[20px] ${
                    isHighlighted ? "bg-yellow-500/20" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-2.5 w-2.5 rounded-sm"
                    checked={selectedLines.has(idx)}
                    onChange={() => toggleLine(idx)}
                    aria-label={`Select line ${idx + 1}`}
                  />
                  <span className="tabular-nums text-right" style={{ minWidth: 24 }}>
                    {idx + 1}
                  </span>
                </div>
              );
            })}
          </div>
          <textarea
            ref={(el) => { (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el; }}
            value={content}
            onChange={handleTextChange}
            onScroll={(e) => {
              const gutter = gutterRef.current;
              if (gutter) gutter.scrollTop = e.currentTarget.scrollTop;
            }}
            className={`flex-1 p-2 text-xs font-mono leading-[20px] bg-transparent resize-none border-0 outline-none ${
              wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre overflow-x-auto"
            }`}
            spellCheck={false}
          />
        </div>
      )}

      {/* Token stats bar */}
      {tokenHighlight && tokenData && (
        <div className="flex items-center gap-4 border-t px-3 py-1.5 bg-muted/20 text-[10px] text-muted-foreground">
          <span className="tabular-nums">
            <strong className="text-foreground">{tokenData.total.toLocaleString()}</strong> tokens
          </span>
          <span className="tabular-nums">
            <strong className="text-foreground">{tokenData.characters.toLocaleString()}</strong> chars
          </span>
          <span className="tabular-nums">
            <strong className="text-foreground">{tokenData.chars_per_token}</strong> chars/token
          </span>
        </div>
      )}
    </div>
  );
}

// Simple markdown line rendering for read-only view
function renderMarkdownLine(line: string) {
  if (line.startsWith("### ")) {
    return <span className="font-semibold text-foreground text-xs">{line}</span>;
  }
  if (line.startsWith("## ")) {
    return <span className="font-bold text-foreground">{line}</span>;
  }
  if (line.startsWith("# ")) {
    return <span className="font-bold text-foreground text-sm">{line}</span>;
  }
  if (line.startsWith("- ") || line.startsWith("* ")) {
    return <span className="text-muted-foreground">{line}</span>;
  }
  // Bold spans
  const boldRegex = /\*\*(.*?)\*\*/;
  if (boldRegex.test(line)) {
    const parts = line.split(/(\*\*.*?\*\*)/);
    return (
      <>
        {parts.map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <span key={i} className="font-bold">{part.slice(2, -2)}</span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  }
  return line;
}
