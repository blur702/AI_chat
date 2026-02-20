"use client";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  cn,
} from "@workstation/ui";
import { Bot, Code, Map as MapIcon, HelpCircle, MessageCircle } from "lucide-react";
import { CHAT_MODES } from "@workstation/api/hooks";
import type { ChatMode } from "@workstation/api/hooks";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot,
  Code,
  Map: MapIcon,
  HelpCircle,
  MessageCircle,
};

interface ChatModeSelectorProps {
  activeMode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

export function ChatModeSelector({
  activeMode,
  onModeChange,
  disabled = false,
}: ChatModeSelectorProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 px-4 py-2 border-t bg-background/50">
        {CHAT_MODES.map((mode) => {
          const Icon = ICON_MAP[mode.icon];
          const isActive = activeMode === mode.key;
          return (
            <Tooltip key={mode.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onModeChange(mode.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-w-0 max-w-[120px] overflow-hidden",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                  aria-pressed={isActive}
                  aria-label={`${mode.label} mode: ${mode.description}`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="hidden sm:inline truncate">{mode.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-48">
                <p className="font-medium">{mode.label}</p>
                <p className="text-xs text-muted-foreground">{mode.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
