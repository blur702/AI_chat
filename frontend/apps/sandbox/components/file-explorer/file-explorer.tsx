"use client";

import { useState } from "react";
import { ScrollArea } from "@workstation/ui";
import { FileTreeItem } from "./file-tree-item";

export interface FileNode {
  name: string;
  type: "file" | "directory";
  children?: FileNode[];
}

const MOCK_FILE_TREE: FileNode[] = [
  {
    name: "src",
    type: "directory",
    children: [
      {
        name: "components",
        type: "directory",
        children: [
          { name: "App.tsx", type: "file" },
          { name: "Header.tsx", type: "file" },
          { name: "Sidebar.tsx", type: "file" },
        ],
      },
      { name: "main.tsx", type: "file" },
      { name: "index.css", type: "file" },
      {
        name: "lib",
        type: "directory",
        children: [
          { name: "utils.ts", type: "file" },
          { name: "api.ts", type: "file" },
        ],
      },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "tsconfig.json", type: "file" },
  { name: "README.md", type: "file" },
];

export function FileExplorer() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col border-r bg-sidebar">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase text-sidebar-foreground">
          Explorer
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {MOCK_FILE_TREE.map((node) => (
            <FileTreeItem
              key={node.name}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
