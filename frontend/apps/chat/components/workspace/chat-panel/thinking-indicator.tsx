"use client";

import { cn } from "@workstation/ui";
import { Bot } from "lucide-react";

interface ThinkingIndicatorProps {
  progress: number;
}

export function ThinkingIndicator({ progress }: ThinkingIndicatorProps) {
  return (
    <div className="flex gap-2 px-3 py-2" role="status" aria-label={`Processing ${progress}%`}>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="h-3 w-3 animate-pulse" />
      </div>

      <div className="flex flex-col gap-1.5 items-start">
        <div className="rounded-md bg-muted px-3 py-1.5 text-xs text-foreground">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Thinking</span>
            <span className="inline-flex gap-0.5">
              <span className="animate-bounce [animation-delay:0ms]">&middot;</span>
              <span className="animate-bounce [animation-delay:150ms]">&middot;</span>
              <span className="animate-bounce [animation-delay:300ms]">&middot;</span>
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 w-32 rounded-full bg-background overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full bg-primary transition-all duration-300 ease-out",
                  progress < 100 && "animate-pulse"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground min-w-[3ch]">
              {progress}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
