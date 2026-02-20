import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  getTokenUsage: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useTokenUsage } from "@workstation/api/hooks/use-token-usage";

const sampleUsage = {
  current_tokens: 500,
  max_tokens: 4096,
  usage_ratio: 0.122,
};

describe("useTokenUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockClient.getTokenUsage.mockResolvedValue(sampleUsage);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches token usage on mount when chatId is provided", async () => {
    const { result } = renderHook(() => useTokenUsage("chat1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockClient.getTokenUsage).toHaveBeenCalledWith("chat1");
    expect(result.current.tokenUsage).toEqual(sampleUsage);
  });

  it("does not fetch when chatId is null", () => {
    const { result } = renderHook(() => useTokenUsage(null));
    expect(mockClient.getTokenUsage).not.toHaveBeenCalled();
    expect(result.current.tokenUsage).toBeNull();
  });

  it("clears usage when chatId becomes null", async () => {
    const { result, rerender } = renderHook(
      ({ chatId }) => useTokenUsage(chatId),
      { initialProps: { chatId: "chat1" as string | null } }
    );

    await waitFor(() => expect(result.current.tokenUsage).toEqual(sampleUsage));

    rerender({ chatId: null });

    expect(result.current.tokenUsage).toBeNull();
  });

  it("sets loading state during fetch", async () => {
    let resolve: (v: unknown) => void;
    mockClient.getTokenUsage.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useTokenUsage("chat1"));

    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      resolve!(sampleUsage);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("silently ignores errors (non-critical)", async () => {
    mockClient.getTokenUsage.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useTokenUsage("chat1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tokenUsage).toBeNull();
  });

  it("refresh re-fetches token usage", async () => {
    const { result } = renderHook(() => useTokenUsage("chat1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    mockClient.getTokenUsage.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockClient.getTokenUsage).toHaveBeenCalledTimes(1);
  });

  it("setFromStream updates usage locally", async () => {
    const { result } = renderHook(() => useTokenUsage("chat1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFromStream({
        token_count: 1000,
        max_tokens: 4096,
        usage_ratio: 0.244,
      });
    });

    expect(result.current.tokenUsage).toEqual({
      current_tokens: 1000,
      max_tokens: 4096,
      usage_ratio: 0.244,
    });
  });

  it("setFromStream ignores incomplete data", async () => {
    const { result } = renderHook(() => useTokenUsage("chat1"));

    await waitFor(() => expect(result.current.tokenUsage).toEqual(sampleUsage));

    act(() => {
      result.current.setFromStream({ token_count: 1000 });
    });

    // Should not update because max_tokens and usage_ratio are missing
    expect(result.current.tokenUsage).toEqual(sampleUsage);
  });

  it("polls at specified interval", async () => {
    const { result } = renderHook(() => useTokenUsage("chat1", 5000));

    await waitFor(() => expect(result.current.loading).toBe(false));
    mockClient.getTokenUsage.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(mockClient.getTokenUsage).toHaveBeenCalled();
  });

  it("does not poll when interval is 0", async () => {
    const { result } = renderHook(() => useTokenUsage("chat1", 0));

    await waitFor(() => expect(result.current.loading).toBe(false));
    mockClient.getTokenUsage.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(mockClient.getTokenUsage).not.toHaveBeenCalled();
  });

  it("stops polling on unmount", async () => {
    const { result, unmount } = renderHook(() => useTokenUsage("chat1", 5000));

    await waitFor(() => expect(result.current.loading).toBe(false));
    mockClient.getTokenUsage.mockClear();

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(mockClient.getTokenUsage).not.toHaveBeenCalled();
  });
});
