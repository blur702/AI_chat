import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  getFileTree: vi.fn(),
  createFile: vi.fn(),
  createDirectory: vi.fn(),
  deleteFile: vi.fn(),
  renameFile: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useFileExplorer } from "@workstation/api/hooks/use-file-explorer";

const sampleFiles = [
  { name: "src", type: "directory", children: [{ name: "index.ts", type: "file" }] },
  { name: "package.json", type: "file" },
];

describe("useFileExplorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getFileTree.mockResolvedValue({ files: sampleFiles });
    mockClient.createFile.mockResolvedValue(undefined);
    mockClient.createDirectory.mockResolvedValue(undefined);
    mockClient.deleteFile.mockResolvedValue(undefined);
    mockClient.renameFile.mockResolvedValue(undefined);
  });

  it("fetches file tree on mount when projectId is provided", async () => {
    const { result } = renderHook(() => useFileExplorer("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockClient.getFileTree).toHaveBeenCalledWith("proj1");
    expect(result.current.fileTree).toEqual(sampleFiles);
  });

  it("does not fetch when projectId is null", () => {
    const { result } = renderHook(() => useFileExplorer(null));
    expect(mockClient.getFileTree).not.toHaveBeenCalled();
    expect(result.current.fileTree).toBeNull();
  });

  it("sets loading during fetch", async () => {
    let resolve: (v: unknown) => void;
    mockClient.getFileTree.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useFileExplorer("proj1"));
    expect(result.current.loading).toBe(true);

    await act(async () => resolve!({ files: sampleFiles }));
    expect(result.current.loading).toBe(false);
  });

  it("sets error on fetch failure", async () => {
    mockClient.getFileTree.mockRejectedValue(new Error("Fetch failed"));
    const { result } = renderHook(() => useFileExplorer("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it("refreshTree re-fetches file tree", async () => {
    const { result } = renderHook(() => useFileExplorer("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refreshTree();
    });

    expect(mockClient.getFileTree).toHaveBeenCalledTimes(2);
  });

  it("createFile calls API and refreshes tree", async () => {
    const { result } = renderHook(() => useFileExplorer("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createFile("src/new.ts", "const x = 1;");
    });

    expect(mockClient.createFile).toHaveBeenCalledWith("proj1", "src/new.ts", "const x = 1;");
    expect(mockClient.getFileTree).toHaveBeenCalledTimes(2);
  });

  it("createFile does nothing when projectId is null", async () => {
    const { result } = renderHook(() => useFileExplorer(null));

    await act(async () => {
      await result.current.createFile("test.ts");
    });

    expect(mockClient.createFile).not.toHaveBeenCalled();
  });

  it("createDirectory calls API and refreshes tree", async () => {
    const { result } = renderHook(() => useFileExplorer("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createDirectory("src/utils");
    });

    expect(mockClient.createDirectory).toHaveBeenCalledWith("proj1", "src/utils");
    expect(mockClient.getFileTree).toHaveBeenCalledTimes(2);
  });

  it("deleteFile calls API and refreshes tree", async () => {
    const { result } = renderHook(() => useFileExplorer("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteFile("src/old.ts");
    });

    expect(mockClient.deleteFile).toHaveBeenCalledWith("proj1", "src/old.ts");
    expect(mockClient.getFileTree).toHaveBeenCalledTimes(2);
  });

  it("deleteFile sets error on failure", async () => {
    mockClient.deleteFile.mockRejectedValue(new Error("Delete failed"));
    const { result } = renderHook(() => useFileExplorer("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteFile("src/old.ts");
    });

    expect(result.current.error).toBeTruthy();
  });

  it("renameFile calls API and refreshes tree", async () => {
    const { result } = renderHook(() => useFileExplorer("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.renameFile("src/old.ts", "src/new.ts");
    });

    expect(mockClient.renameFile).toHaveBeenCalledWith("proj1", "src/old.ts", "src/new.ts");
    expect(mockClient.getFileTree).toHaveBeenCalledTimes(2);
  });

  it("renameFile sets error on failure", async () => {
    mockClient.renameFile.mockRejectedValue(new Error("Rename failed"));
    const { result } = renderHook(() => useFileExplorer("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.renameFile("old.ts", "new.ts");
    });

    expect(result.current.error).toBeTruthy();
  });
});
