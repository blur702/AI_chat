import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  listSnippets: vi.fn(),
  createSnippet: vi.fn(),
  updateSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useSnippets } from "@workstation/api/hooks/use-snippets";

const sampleSnippets = [
  { id: "s1", name: "Snippet 1", content: "content 1" },
  { id: "s2", name: "Snippet 2", content: "content 2" },
];

describe("useSnippets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.listSnippets.mockResolvedValue({ snippets: sampleSnippets });
    mockClient.createSnippet.mockResolvedValue({ id: "s3", name: "New", content: "new content" });
    mockClient.updateSnippet.mockResolvedValue({ id: "s1", name: "Updated", content: "updated" });
    mockClient.deleteSnippet.mockResolvedValue(undefined);
  });

  it("fetches snippets on mount", async () => {
    const { result } = renderHook(() => useSnippets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockClient.listSnippets).toHaveBeenCalledTimes(1);
    expect(result.current.snippets).toEqual(sampleSnippets);
  });

  it("sets loading=true during fetch", async () => {
    let resolve: (v: unknown) => void;
    mockClient.listSnippets.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useSnippets());
    expect(result.current.loading).toBe(true);

    await act(async () => resolve!({ snippets: sampleSnippets }));
    expect(result.current.loading).toBe(false);
  });

  it("sets error on failure", async () => {
    mockClient.listSnippets.mockRejectedValue(new Error("Fetch failed"));
    const { result } = renderHook(() => useSnippets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it("createSnippet calls API and refreshes list", async () => {
    const { result } = renderHook(() => useSnippets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const data = { name: "New", content: "new content" };
    let created: unknown;
    await act(async () => {
      created = await result.current.createSnippet(data as never);
    });

    expect(mockClient.createSnippet).toHaveBeenCalledWith(data);
    expect(created).toEqual({ id: "s3", name: "New", content: "new content" });
    expect(mockClient.listSnippets).toHaveBeenCalledTimes(2);
  });

  it("createSnippet returns null on error", async () => {
    mockClient.createSnippet.mockRejectedValue(new Error("Create failed"));
    const { result } = renderHook(() => useSnippets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: unknown;
    await act(async () => {
      created = await result.current.createSnippet({ name: "Fail", content: "x" } as never);
    });

    expect(created).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("updateSnippet calls API with id and data", async () => {
    const { result } = renderHook(() => useSnippets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const data = { name: "Updated" };
    await act(async () => {
      await result.current.updateSnippet("s1", data as never);
    });

    expect(mockClient.updateSnippet).toHaveBeenCalledWith("s1", data);
    expect(mockClient.listSnippets).toHaveBeenCalledTimes(2);
  });

  it("updateSnippet returns null on error", async () => {
    mockClient.updateSnippet.mockRejectedValue(new Error("Update failed"));
    const { result } = renderHook(() => useSnippets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let updated: unknown;
    await act(async () => {
      updated = await result.current.updateSnippet("s1", { name: "Fail" } as never);
    });

    expect(updated).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("deleteSnippet calls API and refreshes", async () => {
    const { result } = renderHook(() => useSnippets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let deleted: unknown;
    await act(async () => {
      deleted = await result.current.deleteSnippet("s1");
    });

    expect(mockClient.deleteSnippet).toHaveBeenCalledWith("s1");
    expect(deleted).toBe(true);
    expect(mockClient.listSnippets).toHaveBeenCalledTimes(2);
  });

  it("deleteSnippet returns false on error", async () => {
    mockClient.deleteSnippet.mockRejectedValue(new Error("Delete failed"));
    const { result } = renderHook(() => useSnippets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let deleted: unknown;
    await act(async () => {
      deleted = await result.current.deleteSnippet("s1");
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});
