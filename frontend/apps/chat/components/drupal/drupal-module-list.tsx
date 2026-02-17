"use client";

import { useEffect, useState } from "react";
import { Button, cn } from "@workstation/ui";
import { Puzzle, Plus, RefreshCw, FolderOpen, Loader2 } from "lucide-react";
import type { DrupalLocalModuleInfo } from "@workstation/api/types";

interface Props {
  modules: DrupalLocalModuleInfo[];
  loading: boolean;
  onRefresh: () => void;
  onOpenFile: (path: string) => void;
  onScaffold: () => void;
}

export function DrupalModuleList({ modules, loading, onRefresh, onOpenFile, onScaffold }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium uppercase text-muted-foreground">Custom Modules</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onScaffold} title="New Module">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh} title="Refresh">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && modules.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && modules.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <Puzzle className="h-8 w-8 opacity-30" />
            <p className="text-xs">No custom modules found</p>
            <Button variant="outline" size="sm" onClick={onScaffold}>
              <Plus className="h-3 w-3 mr-1" />
              Create Module
            </Button>
          </div>
        )}

        {modules.map((mod) => (
          <button
            key={mod.machine_name}
            className="flex items-start gap-2 w-full text-left px-3 py-2 hover:bg-muted/60 border-b last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={() => onOpenFile(mod.path)}
            aria-label={`Open module: ${mod.name}`}
          >
            <Puzzle className="h-4 w-4 mt-0.5 shrink-0 text-blue-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{mod.name}</div>
              <div className="text-xs text-muted-foreground truncate">{mod.machine_name}</div>
              {mod.description && (
                <div className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">{mod.description}</div>
              )}
            </div>
            <FolderOpen className="h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
