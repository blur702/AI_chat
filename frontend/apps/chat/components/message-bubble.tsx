"use client";

import { useState, useRef, useEffect } from "react";
import { cn, Button, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@workstation/ui";
import { User, Bot, Pin, PinOff, EyeOff, Eye, Pencil, Trash2, Check, X } from "lucide-react";
import { CodeBlock } from "./code-block";

interface MessageBubbleProps {
  id: string;
  role: string;
  content: string;
  timestamp?: string;
  isPinned?: boolean;
  isExcluded?: boolean;
  onPin?: (id: string, pinned: boolean) => void;
  onExclude?: (id: string, excluded: boolean) => void;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
}

function parseCodeBlocks(
  content: string
): Array<{ type: "text" | "code"; content: string; language?: string }> {
  const parts: Array<{ type: "text" | "code"; content: string; language?: string }> = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: "code",
      content: match[2].trim(),
      language: match[1] || "plaintext",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", content }];
}

export function MessageBubble({
  id,
  role,
  content,
  timestamp,
  isPinned = false,
  isExcluded = false,
  onPin,
  onExclude,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const isTemp = id.startsWith("temp-");
  const hasActions = !isTemp && (onPin || onExclude || onEdit || onDelete);
  const parts = parseCodeBlocks(content);

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
    // Only run when editing mode is toggled on, not on every content change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const handleSaveEdit = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== content) {
      onEdit?.(id, trimmed);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(content);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancelEdit();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSaveEdit();
    }
  };

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-3 transition-colors",
        isUser ? "flex-row-reverse" : "",
        isExcluded && "opacity-50"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-1",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "relative rounded-lg px-4 py-2 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {/* Pinned indicator */}
          {isPinned && (
            <div className="absolute -top-2 -right-2">
              <Pin className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            </div>
          )}

          {editing ? (
            <div className="min-w-[300px]">
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full resize-none rounded border border-border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                rows={Math.min(editContent.split("\n").length + 1, 10)}
              />
              <div className="mt-1.5 flex items-center gap-1.5">
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleSaveEdit}>
                  <Check className="mr-1 h-3 w-3" />
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancelEdit}>
                  <X className="mr-1 h-3 w-3" />
                  Cancel
                </Button>
                <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+Enter to save</span>
              </div>
            </div>
          ) : (
            <>
              {parts.map((part, i) =>
                part.type === "code" ? (
                  <CodeBlock
                    key={i}
                    code={part.content}
                    language={part.language || "plaintext"}
                  />
                ) : (
                  <p key={i} className="whitespace-pre-wrap">
                    {part.content}
                  </p>
                )
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {timestamp && (
            <span className="text-xs text-muted-foreground">{timestamp}</span>
          )}
          {isPinned && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Pinned</span>
          )}
          {isExcluded && (
            <span className="text-[10px] text-muted-foreground font-medium">Excluded from context</span>
          )}
        </div>
      </div>

      {/* Hover action toolbar */}
      {hasActions && !editing && (
        <TooltipProvider delayDuration={300}>
          <div
            className={cn(
              "absolute top-1 flex items-center gap-0.5 rounded-md border bg-background/95 px-1 py-0.5 shadow-sm backdrop-blur-sm",
              "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
              isUser ? "left-2" : "right-2"
            )}
          >
            {onPin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => onPin(id, !isPinned)}
                  >
                    {isPinned ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {isPinned ? "Unpin (keeps in context)" : "Pin (preserve during compaction)"}
                </TooltipContent>
              </Tooltip>
            )}

            {onExclude && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => onExclude(id, !isExcluded)}
                  >
                    {isExcluded ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {isExcluded ? "Include in context" : "Exclude from context"}
                </TooltipContent>
              </Tooltip>
            )}

            {onEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setEditContent(content);
                      setEditing(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Edit message</TooltipContent>
              </Tooltip>
            )}

            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() => onDelete(id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Delete message</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
