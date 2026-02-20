import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  getAssembledContext: vi.fn(),
  updateCompactionSummary: vi.fn(),
  updateChatInstructions: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useContextEditor } from "@workstation/api/hooks/use-context-editor";

const sampleContext = {
  layers: [
    { name: "System", content: "You are an assistant.\nBe helpful." },
    { name: "History", content: "User said hello.\nAssistant replied." },
  ],
  total_tokens: 100,
};

describe("useContextEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getAssembledContext.mockResolvedValue(sampleContext);
    mockClient.updateCompactionSummary.mockResolvedValue(undefined);
    mockClient.updateChatInstructions.mockResolvedValue(undefined);
  });

  it("initial state is empty", () => {
    const { result } = renderHook(() => useContextEditor("chat1"));
    expect(result.current.assembledContext).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.searchQuery).toBe("");
    expect(result.current.searchResults).toEqual([]);
  });

  it("fetchContext loads assembled context", async () => {
    const { result } = renderHook(() => useContextEditor("chat1"));

    await act(async () => {
      await result.current.fetchContext();
    });

    expect(mockClient.getAssembledContext).toHaveBeenCalledWith("chat1", undefined);
    expect(result.current.assembledContext).toEqual(sampleContext);
  });

  it("fetchContext passes model parameter", async () => {
    const { result } = renderHook(() => useContextEditor("chat1"));

    await act(async () => {
      await result.current.fetchContext("gpt-4");
    });

    expect(mockClient.getAssembledContext).toHaveBeenCalledWith("chat1", "gpt-4");
  });

  it("fetchContext sets loading state", async () => {
    let resolve: (v: unknown) => void;
    mockClient.getAssembledContext.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useContextEditor("chat1"));

    let promise: Promise<void>;
    act(() => {
      promise = result.current.fetchContext();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve!(sampleContext);
      await promise!;
    });

    expect(result.current.loading).toBe(false);
  });

  it("fetchContext sets error on failure", async () => {
    mockClient.getAssembledContext.mockRejectedValue(new Error("Fetch error"));
    const { result } = renderHook(() => useContextEditor("chat1"));

    await act(async () => {
      await result.current.fetchContext();
    });

    expect(result.current.error).toBeTruthy();
  });

  it("fetchContext skips when chatId is empty", async () => {
    const { result } = renderHook(() => useContextEditor(""));

    await act(async () => {
      await result.current.fetchContext();
    });

    expect(mockClient.getAssembledContext).not.toHaveBeenCalled();
  });

  it("updateCompaction calls API and refreshes", async () => {
    const { result } = renderHook(() => useContextEditor("chat1"));

    await act(async () => {
      await result.current.updateCompaction("comp1", "New summary");
    });

    expect(mockClient.updateCompactionSummary).toHaveBeenCalledWith("chat1", "comp1", "New summary");
    expect(mockClient.getAssembledContext).toHaveBeenCalled();
  });

  it("updateCompaction sets saving state", async () => {
    let resolve: (v: unknown) => void;
    mockClient.updateCompactionSummary.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useContextEditor("chat1"));

    let promise: Promise<void>;
    act(() => {
      promise = result.current.updateCompaction("comp1", "summary");
    });

    expect(result.current.saving).toBe(true);

    await act(async () => {
      resolve!(undefined);
      await promise!;
    });

    expect(result.current.saving).toBe(false);
  });

  it("updateInstructions calls API and refreshes", async () => {
    const { result } = renderHook(() => useContextEditor("chat1"));

    await act(async () => {
      await result.current.updateInstructions("New instructions");
    });

    expect(mockClient.updateChatInstructions).toHaveBeenCalledWith("chat1", "New instructions");
    expect(mockClient.getAssembledContext).toHaveBeenCalled();
  });

  it("search finds matching lines across layers", async () => {
    const { result } = renderHook(() => useContextEditor("chat1"));

    // First load context
    await act(async () => {
      await result.current.fetchContext();
    });

    // Then search
    act(() => {
      result.current.search("hello");
    });

    expect(result.current.searchQuery).toBe("hello");
    expect(result.current.searchResults).toHaveLength(1);
    expect(result.current.searchResults[0]).toMatchObject({
      layerIndex: 1,
      layerName: "History",
      lineNumber: 1,
      text: "User said hello.",
    });
  });

  it("search is case-insensitive", async () => {
    const { result } = renderHook(() => useContextEditor("chat1"));

    await act(async () => {
      await result.current.fetchContext();
    });

    act(() => {
      result.current.search("ASSISTANT");
    });

    // "assistant" appears in "You are an assistant." (System layer) and "Assistant replied." (History layer)
    expect(result.current.searchResults).toHaveLength(2);
  });

  it("search returns empty for blank query", async () => {
    const { result } = renderHook(() => useContextEditor("chat1"));

    await act(async () => {
      await result.current.fetchContext();
    });

    act(() => {
      result.current.search("   ");
    });

    expect(result.current.searchResults).toEqual([]);
  });

  it("clearSearch resets query and results", async () => {
    const { result } = renderHook(() => useContextEditor("chat1"));

    await act(async () => {
      await result.current.fetchContext();
    });

    act(() => {
      result.current.search("hello");
    });

    expect(result.current.searchResults.length).toBeGreaterThan(0);

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.searchQuery).toBe("");
    expect(result.current.searchResults).toEqual([]);
  });
});
