"use client";

import { useState, useCallback } from "react";
import { cn, Button, Input } from "@workstation/ui";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  FolderPlus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { DrupalLocalFileNode } from "@workstation/api/types";

interface TreeNodeProps {
  node: DrupalLocalFileNode;
  depth: number;
  activePath?: string;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
}

function TreeNode({ node, depth, activePath, onSelect, onDelete }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "directory";
  const isActive = node.path === activePath;

  return (
    <div>
      <button
        role="treeitem"
        aria-expanded={isDir ? expanded : undefined}
        aria-selected={isActive}
        aria-label={`${node.name}${isDir ? " folder" : ""}`}
        className={cn(
          "flex items-center w-full text-left text-sm py-1 px-1 hover:bg-muted/60 rounded-sm group",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          isActive && "bg-accent text-accent-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => {
          if (isDir) {
            setExpanded(!expanded);
          } else {
            onSelect(node.path);
          }
        }}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 mr-1 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 mr-1 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 mr-1 shrink-0" />
        )}
        {isDir ? (
          expanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 mr-1.5 text-blue-400" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 mr-1.5 text-blue-400" />
          )
        ) : (
          <File className="h-4 w-4 shrink-0 mr-1.5 text-muted-foreground" />
        )}
        <span className="truncate flex-1">{node.name}</span>
        {onDelete && (
          <button
            type="button"
            className="hidden group-hover:inline-flex group-focus-within:inline-flex ml-1 p-0.5 rounded hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.path);
            }}
            aria-label={`Delete ${node.name}`}
            tabIndex={0}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        )}
      </button>
      {isDir && expanded && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          activePath={activePath}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface Props {
  files: DrupalLocalFileNode[];
  loading: boolean;
  activePath?: string;
  onSelect: (path: string) => void;
  onRefresh: () => void;
  onCreateFile?: (path: string) => void;
  onCreateDir?: (path: string) => void;
  onDelete?: (path: string) => void;
}

export function DrupalFileExplorer({
  files,
  loading,
  activePath,
  onSelect,
  onRefresh,
  onCreateFile,
  onCreateDir,
  onDelete,
}: Props) {
  const [showNewInput, setShowNewInput] = useState<"file" | "dir" | null>(null);
  const [newName, setNewName] = useState("");

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    if (showNewInput === "file" && onCreateFile) {
      onCreateFile(newName.trim());
    } else if (showNewInput === "dir" && onCreateDir) {
      onCreateDir(newName.trim());
    }
    setNewName("");
    setShowNewInput(null);
  }, [newName, showNewInput, onCreateFile, onCreateDir]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b">
        <span className="text-xs font-medium uppercase text-muted-foreground">Explorer</span>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowNewInput("file")}
            title="New File"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowNewInput("dir")}
            title="New Folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onRefresh}
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {showNewInput && (
        <div className="flex items-center gap-1 px-2 py-1 border-b">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={showNewInput === "file" ? "filename.php" : "directory-name"}
            className="h-6 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setShowNewInput(null); setNewName(""); }
            }}
            autoFocus
          />
          <Button size="icon" className="h-6 w-6 shrink-0" onClick={handleCreate}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1" role="tree" aria-label="Drupal file tree">
        {files.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground text-center py-4">No files found</p>
        )}
        {files.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
