import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  getKBChunks: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useKnowledgeBase } from "@workstation/api/hooks/use-knowledge-base";

const sampleChunks = [
  { id: "c1", text: "chunk 1", metadata: {} },
  { id: "c2", text: "chunk 2", metadata: {} },
];

describe("useKnowledgeBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getKBChunks.mockResolvedValue(sampleChunks);
  });

  it("initial state: empty chunks, not loading", () => {
    const { result } = renderHook(() => useKnowledgeBase());
    expect(result.current.chunks).toEqual([]);
    expect(result.current.chunksLoading).toBe(false);
    expect(result.current.chunksError).toBeNull();
  });

  it("getChunks fetches and sets chunks", async () => {
    const { result } = renderHook(() => useKnowledgeBase());

    await act(async () => {
      await result.current.getChunks("collection1");
    });

    expect(mockClient.getKBChunks).toHaveBeenCalled();
    expect(result.current.chunks).toEqual(sampleChunks);
  });

  it("getChunks sets total from result length when page is not full", async () => {
    // 2 results with default limit (typically larger), so total = skip + result.length
    mockClient.getKBChunks.mockResolvedValue(sampleChunks);
    const { result } = renderHook(() => useKnowledgeBase());

    await act(async () => {
      await result.current.getChunks("collection1", 0, 50);
    });

    // 2 results < 50 limit => total = 0 + 2 = 2
    expect(result.current.totalChunks).toBe(2);
  });

  it("getChunks estimates more when page is full", async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, text: `chunk ${i}` }));
    mockClient.getKBChunks.mockResolvedValue(fullPage);
    const { result } = renderHook(() => useKnowledgeBase());

    await act(async () => {
      await result.current.getChunks("collection1", 0, 50);
    });

    // Full page => total = 0 + 50 + 1 = 51 (estimate more exist)
    expect(result.current.totalChunks).toBe(51);
  });

  it("getChunks sets error on failure and clears chunks", async () => {
    mockClient.getKBChunks.mockRejectedValue(new Error("KB error"));
    const { result } = renderHook(() => useKnowledgeBase());

    await act(async () => {
      await result.current.getChunks("collection1");
    });

    expect(result.current.chunksError).toBeTruthy();
    expect(result.current.chunks).toEqual([]);
  });

  it("getChunks sets loading states", async () => {
    let resolve: (v: unknown) => void;
    mockClient.getKBChunks.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useKnowledgeBase());

    let promise: Promise<void>;
    act(() => {
      promise = result.current.getChunks("collection1");
    });

    expect(result.current.chunksLoading).toBe(true);

    await act(async () => {
      resolve!(sampleChunks);
      await promise!;
    });

    expect(result.current.chunksLoading).toBe(false);
  });
});
