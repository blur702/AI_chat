"use client";

import { Button, cn } from "@workstation/ui";
import { Palette, RefreshCw, FolderOpen, Loader2 } from "lucide-react";
import type { DrupalLocalThemeInfo } from "@workstation/api/types";

interface Props {
  themes: DrupalLocalThemeInfo[];
  loading: boolean;
  onRefresh: () => void;
  onOpenFile: (path: string) => void;
}

export function DrupalThemeList({ themes, loading, onRefresh, onOpenFile }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium uppercase text-muted-foreground">Custom Themes</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh} title="Refresh">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && themes.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && themes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <Palette className="h-8 w-8 opacity-30" />
            <p className="text-xs">No custom themes found</p>
          </div>
        )}

        {themes.map((theme) => (
          <button
            key={theme.machine_name}
            className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-muted/60 border-b last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={() => onOpenFile(theme.path)}
            aria-label={`Open theme: ${theme.name}`}
          >
            <Palette className="h-4 w-4 shrink-0 text-purple-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{theme.name}</div>
              <div className="text-xs text-muted-foreground truncate">{theme.machine_name}</div>
            </div>
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
