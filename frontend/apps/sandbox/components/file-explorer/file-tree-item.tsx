"use client";

import { useState } from "react";
import { cn } from "@workstation/ui";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { FileNode } from "./file-explorer";

interface FileTreeItemProps {
  node: FileNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  parentPath?: string;
}

export function FileTreeItem({
  node,
  depth,
  selectedFile,
  onSelect,
  parentPath = "",
}: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const isSelected = selectedFile === fullPath;

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-sm px-2 py-2 text-sm hover:bg-sidebar-accent min-h-[44px]",
            isSelected && "bg-sidebar-accent"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          {expanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
          )}
          <span className="truncate text-sidebar-foreground">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.name}
                node={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                onSelect={onSelect}
                parentPath={fullPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(fullPath)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-sm px-2 py-2 text-sm hover:bg-sidebar-accent min-h-[44px]",
        isSelected && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
    >
      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sidebar-foreground">{node.name}</span>
    </button>
  );
}
