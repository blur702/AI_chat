"use client";

import { cn } from "@workstation/ui";
import { X } from "lucide-react";

interface TabInfo {
  path: string;
  name: string;
  isDirty: boolean;
}

interface EditorTabsProps {
  files: TabInfo[];
  activeFile: string;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function EditorTabs({
  files,
  activeFile,
  onSelect,
  onClose,
}: EditorTabsProps) {
  return (
    <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
      {files.map((file) => (
        <div
          key={file.path}
          className={cn(
            "group flex items-center gap-1.5 border-r px-3 py-1.5 text-sm cursor-pointer transition-colors",
            file.path === activeFile
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          onClick={() => onSelect(file.path)}
        >
          {file.isDirty && (
            <span className="h-2 w-2 rounded-full bg-primary" />
          )}
          <span className="truncate max-w-[120px]">{file.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(file.path);
            }}
            className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
            aria-label={`Close ${file.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
