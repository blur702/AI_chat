"use client";

import { cn } from "@workstation/ui";
import type { TokenUsage } from "@workstation/api/hooks/use-token-usage";

interface TokenUsageBarProps {
  tokenUsage: TokenUsage | null;
}

export function TokenUsageBar({ tokenUsage }: TokenUsageBarProps) {
  if (!tokenUsage || tokenUsage.max_tokens === 0) return null;

  const percentage = Math.round(tokenUsage.usage_ratio * 100);
  const level =
    percentage > 80 ? "high" : percentage > 60 ? "medium" : "low";

  return (
    <div className="px-4 pb-2">
      <div className="rounded-md bg-muted/40 px-3 py-2">
        <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              level === "low" && "bg-green-500",
              level === "medium" && "bg-yellow-500",
              level === "high" && "bg-red-500"
            )}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {tokenUsage.current_tokens.toLocaleString()} /{" "}
            {tokenUsage.max_tokens.toLocaleString()} tokens ({percentage}%)
          </span>
          {level === "high" && (
            <span className="text-red-500 font-medium">
              Context nearly full — compaction will trigger soon
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
