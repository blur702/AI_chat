"use client";

import { useState, useCallback, useRef } from "react";
import {
  cn,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  Input,
} from "@workstation/ui";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Trash2,
  Pencil,
  FilePlus,
  FolderPlus,
  Wrench,
} from "lucide-react";
import { NewItemInput } from "./new-item-input";
import type { FileNode } from "@workstation/api/types";

interface FileTreeItemProps {
  node: FileNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => Promise<void>;
  onRename: (oldPath: string, newPath: string) => Promise<void>;
  onCreateFile: (path: string, content?: string) => Promise<void>;
  onCreateDirectory: (path: string) => Promise<void>;
  onRunToolOnFile?: (path: string) => void;
}

export function FileTreeItem({
  node,
  depth,
  selectedFile,
  onSelect,
  onDelete,
  onRename,
  onCreateFile,
  onCreateDirectory,
  onRunToolOnFile,
}: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [creatingType, setCreatingType] = useState<"file" | "directory" | null>(null);

  const isSelected = selectedFile === node.path;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const handleRenameSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (renameValue.trim() && renameValue !== node.name) {
        const parentPath = node.path.includes("/")
          ? node.path.substring(0, node.path.lastIndexOf("/"))
          : "";
        const newPath = parentPath
          ? `${parentPath}/${renameValue.trim()}`
          : renameValue.trim();
        await onRename(node.path, newPath);
      }
    } catch (error) {
      setRenameValue(node.name);
      console.error("Rename failed:", error);
    } finally {
      setIsRenaming(false);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [renameValue, node.name, node.path, onRename]);

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!isSubmittingRef.current) {
        void handleRenameSubmit();
      }
    } else if (e.key === "Escape") {
      setRenameValue(node.name);
      setIsRenaming(false);
    }
  };

  const handleDelete = useCallback(async () => {
    try {
      await onDelete(node.path);
    } catch (error) {
      console.error("Delete failed:", error);
    }
  }, [node.path, onDelete]);

  const handleNewItemSubmit = useCallback(
    async (fullPath: string) => {
      if (creatingType === "file") {
        await onCreateFile(fullPath);
      } else if (creatingType === "directory") {
        await onCreateDirectory(fullPath);
      }
      setCreatingType(null);
    },
    [creatingType, onCreateFile, onCreateDirectory]
  );

  const contextMenuItems = (
    <>
      <ContextMenuItem onClick={() => {
        setRenameValue(node.name);
        setIsRenaming(true);
      }}>
        <Pencil className="mr-2 h-3.5 w-3.5" />
        Rename
      </ContextMenuItem>
      {node.type === "directory" && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => {
            setExpanded(true);
            setCreatingType("file");
          }}>
            <FilePlus className="mr-2 h-3.5 w-3.5" />
            New File
          </ContextMenuItem>
          <ContextMenuItem onClick={() => {
            setExpanded(true);
            setCreatingType("directory");
          }}>
            <FolderPlus className="mr-2 h-3.5 w-3.5" />
            New Folder
          </ContextMenuItem>
        </>
      )}
      {node.type === "file" && onRunToolOnFile && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onRunToolOnFile(node.path)}>
            <Wrench className="mr-2 h-3.5 w-3.5" />
            Run Tool on File
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={handleDelete}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-3.5 w-3.5" />
        Delete
      </ContextMenuItem>
    </>
  );

  if (node.type === "directory") {
    return (
      <div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
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
              {isRenaming ? (
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={() => {
                    if (!isSubmittingRef.current) {
                      void handleRenameSubmit();
                    }
                  }}
                  className="h-5 text-xs px-1 py-0"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate text-sidebar-foreground">{node.name}</span>
              )}
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent>{contextMenuItems}</ContextMenuContent>
        </ContextMenu>
        {expanded && (
          <div>
            {creatingType && (
              <NewItemInput
                type={creatingType}
                onSubmit={handleNewItemSubmit}
                onCancel={() => setCreatingType(null)}
                depth={depth + 1}
                parentPath={node.path}
              />
            )}
            {node.children?.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                onSelect={onSelect}
                onDelete={onDelete}
                onRename={onRename}
                onCreateFile={onCreateFile}
                onCreateDirectory={onCreateDirectory}
                onRunToolOnFile={onRunToolOnFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={() => onSelect(node.path)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-sm px-2 py-2 text-sm hover:bg-sidebar-accent min-h-[44px]",
            isSelected && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
          style={{ paddingLeft: `${depth * 12 + 24}px` }}
        >
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => {
                if (!isSubmittingRef.current) {
                  void handleRenameSubmit();
                }
              }}
              className="h-5 text-xs px-1 py-0"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate text-sidebar-foreground">{node.name}</span>
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>{contextMenuItems}</ContextMenuContent>
    </ContextMenu>
  );
}
