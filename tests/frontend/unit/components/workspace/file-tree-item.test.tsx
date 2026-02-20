import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { workstationUiMock } from "../../test-utils";

vi.mock("@workstation/ui", () => ({
  ...workstationUiMock,
  ContextMenu: ({ children }: any) => <>{children}</>,
  ContextMenuTrigger: ({ children }: any) => <>{children}</>,
  ContextMenuContent: ({ children }: any) => <div>{children}</div>,
  ContextMenuItem: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  ContextMenuSeparator: () => <hr />,
}));

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => ({ children, ...props }: any) => <span data-icon={name} {...props}>{children}</span>,
}));

vi.mock("./new-item-input", () => ({
  NewItemInput: ({ onSubmit, onCancel, type }: any) => (
    <div data-testid="new-item-input">
      <span>{type}</span>
      <button onClick={() => onSubmit("test")}>Submit</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

import { FileTreeItem } from "@/components/workspace/file-explorer/file-tree-item";

const fileNode = {
  name: "index.ts",
  path: "src/index.ts",
  type: "file" as const,
};

const dirNode = {
  name: "src",
  path: "src",
  type: "directory" as const,
  children: [fileNode],
};

describe("FileTreeItem", () => {
  const onSelect = vi.fn();
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const onRename = vi.fn().mockResolvedValue(undefined);
  const onCreateFile = vi.fn().mockResolvedValue(undefined);
  const onCreateDirectory = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders file name", () => {
    render(
      <FileTreeItem
        node={fileNode}
        depth={0}
        selectedFile={null}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onCreateFile={onCreateFile}
        onCreateDirectory={onCreateDirectory}
      />
    );
    expect(screen.getByText("index.ts")).toBeInTheDocument();
  });

  it("calls onSelect when file clicked", () => {
    render(
      <FileTreeItem
        node={fileNode}
        depth={0}
        selectedFile={null}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onCreateFile={onCreateFile}
        onCreateDirectory={onCreateDirectory}
      />
    );
    fireEvent.click(screen.getByText("index.ts"));
    expect(onSelect).toHaveBeenCalledWith("src/index.ts");
  });

  it("renders directory name", () => {
    render(
      <FileTreeItem
        node={dirNode}
        depth={0}
        selectedFile={null}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onCreateFile={onCreateFile}
        onCreateDirectory={onCreateDirectory}
      />
    );
    expect(screen.getByText("src")).toBeInTheDocument();
  });

  it("expands directory on click", () => {
    render(
      <FileTreeItem
        node={{ ...dirNode, children: [fileNode] }}
        depth={1}
        selectedFile={null}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onCreateFile={onCreateFile}
        onCreateDirectory={onCreateDirectory}
      />
    );
    // depth=1 starts collapsed
    expect(screen.queryByText("index.ts")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("src"));
    expect(screen.getByText("index.ts")).toBeInTheDocument();
  });

  it("depth=0 directory starts expanded", () => {
    render(
      <FileTreeItem
        node={{ ...dirNode, children: [fileNode] }}
        depth={0}
        selectedFile={null}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onCreateFile={onCreateFile}
        onCreateDirectory={onCreateDirectory}
      />
    );
    expect(screen.getByText("index.ts")).toBeInTheDocument();
  });
});
