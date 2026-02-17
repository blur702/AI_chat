import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  updateChatMode: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useChatMode } from "@workstation/api/hooks/use-chat-mode";

describe("useChatMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.updateChatMode.mockResolvedValue(undefined);
  });

  it("defaults to 'agent' mode", () => {
    const { result } = renderHook(() => useChatMode("chat1"));
    expect(result.current.chatMode).toBe("agent");
  });

  it("uses initialMode when valid", () => {
    const { result } = renderHook(() => useChatMode("chat1", "plan"));
    expect(result.current.chatMode).toBe("plan");
  });

  it("ignores invalid initialMode", () => {
    const { result } = renderHook(() => useChatMode("chat1", "invalidMode" as never));
    expect(result.current.chatMode).toBe("agent");
  });

  it("setChatMode updates state", async () => {
    const { result } = renderHook(() => useChatMode("chat1"));

    await act(async () => {
      result.current.setChatMode("plan");
    });

    expect(result.current.chatMode).toBe("plan");
  });

  it("setChatMode calls API when chatId present", async () => {
    const { result } = renderHook(() => useChatMode("chat1"));

    await act(async () => {
      result.current.setChatMode("plan");
    });

    expect(mockClient.updateChatMode).toHaveBeenCalledWith("chat1", "plan");
  });

  it("setChatMode reverts on API error", async () => {
    mockClient.updateChatMode.mockRejectedValue(new Error("API error"));
    const { result } = renderHook(() => useChatMode("chat1"));

    expect(result.current.chatMode).toBe("agent");

    await act(async () => {
      result.current.setChatMode("plan");
    });

    // Should revert to original mode after API failure
    await waitFor(() => expect(result.current.chatMode).toBe("agent"));
  });

  it("setChatMode doesn't call API when chatId is null", async () => {
    const { result } = renderHook(() => useChatMode(null as unknown as string));

    await act(async () => {
      result.current.setChatMode("plan");
    });

    expect(mockClient.updateChatMode).not.toHaveBeenCalled();
  });

  it("syncFromServer updates mode", async () => {
    const { result } = renderHook(() => useChatMode("chat1"));

    act(() => {
      result.current.syncFromServer("plan");
    });

    expect(result.current.chatMode).toBe("plan");
  });

  it("syncFromServer ignores invalid mode", () => {
    const { result } = renderHook(() => useChatMode("chat1"));

    act(() => {
      result.current.syncFromServer("invalidMode");
    });

    expect(result.current.chatMode).toBe("agent");
  });

  it("modes returns CHAT_MODES array", () => {
    const { result } = renderHook(() => useChatMode("chat1"));
    expect(Array.isArray(result.current.modes)).toBe(true);
    expect(result.current.modes.length).toBeGreaterThan(0);
  });
});
