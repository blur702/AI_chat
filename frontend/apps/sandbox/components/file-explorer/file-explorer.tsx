"use client";

import { useState, useCallback } from "react";
import { ScrollArea, Button, Skeleton } from "@workstation/ui";
import { FilePlus, FolderPlus, RefreshCw } from "lucide-react";
import { FileTreeItem } from "./file-tree-item";
import { NewItemInput } from "./new-item-input";
import type { FileNode } from "@workstation/api/types";

interface FileExplorerProps {
  projectId: string | null;
  fileTree: FileNode[] | null;
  loading: boolean;
  error: string | null;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => Promise<void>;
  onCreateFile: (path: string, content?: string) => Promise<void>;
  onCreateDirectory: (path: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
  onRename: (oldPath: string, newPath: string) => Promise<void>;
}

export function FileExplorer({
  projectId,
  fileTree,
  loading,
  error,
  selectedFile,
  onSelect,
  onRefresh,
  onCreateFile,
  onCreateDirectory,
  onDelete,
  onRename,
}: FileExplorerProps) {
  const [creatingType, setCreatingType] = useState<"file" | "directory" | null>(null);

  const handleNewItemSubmit = useCallback(
    async (name: string) => {
      if (creatingType === "file") {
        await onCreateFile(name);
      } else if (creatingType === "directory") {
        await onCreateDirectory(name);
      }
      setCreatingType(null);
    },
    [creatingType, onCreateFile, onCreateDirectory]
  );

  return (
    <div className="flex h-full flex-col border-r bg-sidebar">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase text-sidebar-foreground">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCreatingType("file")}
            title="New File"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCreatingType("directory")}
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
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {loading && !fileTree && (
            <div className="space-y-1 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          )}

          {error && (
            <div className="p-3 text-xs text-destructive">{error}</div>
          )}

          {creatingType && (
            <NewItemInput
              type={creatingType}
              onSubmit={handleNewItemSubmit}
              onCancel={() => setCreatingType(null)}
              depth={0}
              parentPath=""
            />
          )}

          {fileTree &&
            fileTree.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                selectedFile={selectedFile}
                onSelect={onSelect}
                onDelete={onDelete}
                onRename={onRename}
                onCreateFile={onCreateFile}
                onCreateDirectory={onCreateDirectory}
              />
            ))}

          {fileTree && fileTree.length === 0 && !loading && !error && (
            <div className="p-3 text-xs text-muted-foreground text-center">
              Empty workspace
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
