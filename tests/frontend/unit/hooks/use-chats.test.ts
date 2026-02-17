import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChats } from "@workstation/api/hooks/use-chats";

const mockClient = {
  getProjectChats: vi.fn(),
  createChat: vi.fn(),
  updateChat: vi.fn(),
  deleteChat: vi.fn(),
};

vi.mock("@workstation/api/client", () => ({
  getClient: () => mockClient,
}));

describe("useChats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty chats when projectId is null", () => {
    const { result } = renderHook(() => useChats(null));
    expect(result.current.chats).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockClient.getProjectChats).not.toHaveBeenCalled();
  });

  it("fetches chats on mount when projectId provided", async () => {
    const mockChats = [
      { id: "c-1", title: "Chat 1", created_at: "2026-01-01" },
      { id: "c-2", title: "Chat 2", created_at: "2026-01-02" },
    ];
    mockClient.getProjectChats.mockResolvedValue({ chats: mockChats });

    const { result } = renderHook(() => useChats("proj-1"));

    await waitFor(() => {
      expect(result.current.chats).toEqual(mockChats);
    });
    expect(mockClient.getProjectChats).toHaveBeenCalledWith("proj-1");
  });

  it("sets loading=true during fetch", async () => {
    mockClient.getProjectChats.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ chats: [] }), 50))
    );

    const { result } = renderHook(() => useChats("proj-1"));
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("sets error on fetch failure", async () => {
    mockClient.getProjectChats.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useChats("proj-1"));

    await waitFor(() => {
      expect(result.current.error).toBe("Network error");
    });
    expect(result.current.loading).toBe(false);
  });

  it("createChat calls API and refreshes", async () => {
    mockClient.getProjectChats.mockResolvedValue({ chats: [] });
    mockClient.createChat.mockResolvedValue({ id: "new-chat" });

    const { result } = renderHook(() => useChats("proj-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let chatId: string | null = null;
    await act(async () => {
      chatId = await result.current.createChat("New Chat");
    });

    expect(chatId).toBe("new-chat");
    expect(mockClient.createChat).toHaveBeenCalledWith("proj-1", "New Chat");
  });

  it("createChat returns null when projectId is null", async () => {
    const { result } = renderHook(() => useChats(null));

    let chatId: string | null = "should-be-null";
    await act(async () => {
      chatId = await result.current.createChat("Test");
    });

    expect(chatId).toBeNull();
  });

  it("updateChat updates local state optimistically", async () => {
    const chat = { id: "c-1", title: "Old Title", is_pinned: false, is_archived: false, updated_at: "2026-01-01" };
    mockClient.getProjectChats.mockResolvedValue({ chats: [chat] });
    mockClient.updateChat.mockResolvedValue({ ...chat, title: "New Title", updated_at: "2026-01-02" });

    const { result } = renderHook(() => useChats("proj-1"));

    await waitFor(() => {
      expect(result.current.chats).toHaveLength(1);
    });

    let success = false;
    await act(async () => {
      success = await result.current.updateChat("c-1", { title: "New Title" });
    });

    expect(success).toBe(true);
    expect(result.current.chats[0].title).toBe("New Title");
  });

  it("deleteChat removes chat from local state", async () => {
    const chats = [
      { id: "c-1", title: "Chat 1" },
      { id: "c-2", title: "Chat 2" },
    ];
    mockClient.getProjectChats.mockResolvedValue({ chats });
    mockClient.deleteChat.mockResolvedValue(undefined);

    const { result } = renderHook(() => useChats("proj-1"));

    await waitFor(() => {
      expect(result.current.chats).toHaveLength(2);
    });

    await act(async () => {
      await result.current.deleteChat("c-1");
    });

    expect(result.current.chats).toHaveLength(1);
    expect(result.current.chats[0].id).toBe("c-2");
  });

  it("deleteChat sets error on failure", async () => {
    mockClient.getProjectChats.mockResolvedValue({ chats: [{ id: "c-1", title: "Chat" }] });
    mockClient.deleteChat.mockRejectedValue(new Error("Delete failed"));

    const { result } = renderHook(() => useChats("proj-1"));

    await waitFor(() => {
      expect(result.current.chats).toHaveLength(1);
    });

    let success = true;
    await act(async () => {
      success = await result.current.deleteChat("c-1");
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Delete failed");
  });

  it("clears chats when projectId changes to null", async () => {
    mockClient.getProjectChats.mockResolvedValue({ chats: [{ id: "c-1", title: "Chat" }] });

    const { result, rerender } = renderHook(({ pid }) => useChats(pid), {
      initialProps: { pid: "proj-1" as string | null },
    });

    await waitFor(() => {
      expect(result.current.chats).toHaveLength(1);
    });

    rerender({ pid: null });

    await waitFor(() => {
      expect(result.current.chats).toEqual([]);
    });
  });
});
