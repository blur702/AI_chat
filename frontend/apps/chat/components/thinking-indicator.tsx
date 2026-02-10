"use client";

import { cn } from "@workstation/ui";
import { Bot } from "lucide-react";

interface ThinkingIndicatorProps {
  progress: number;
}

export function ThinkingIndicator({ progress }: ThinkingIndicatorProps) {
  return (
    <div className="flex gap-3 px-4 py-3" role="status" aria-label={`Processing ${progress}%`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="h-4 w-4 animate-pulse" />
      </div>

      <div className="flex max-w-[80%] flex-col gap-2 items-start">
        <div className="rounded-lg bg-muted px-4 py-2 text-sm text-foreground">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Thinking</span>
            <span className="inline-flex gap-0.5">
              <span className="animate-bounce [animation-delay:0ms]">&middot;</span>
              <span className="animate-bounce [animation-delay:150ms]">&middot;</span>
              <span className="animate-bounce [animation-delay:300ms]">&middot;</span>
            </span>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 w-48 rounded-full bg-background overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-all duration-300 ease-out",
                  progress < 100 && "animate-pulse"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground min-w-[3ch]">
              {progress}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
