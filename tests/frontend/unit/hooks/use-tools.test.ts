import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  listTools: vi.fn(),
  executeTool: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useTools } from "@workstation/api/hooks/use-tools";

const sampleTools = [
  { name: "search", description: "Search the web" },
  { name: "code", description: "Execute code" },
];

describe("useTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.listTools.mockResolvedValue({ tools: sampleTools });
    mockClient.executeTool.mockResolvedValue({ result: "ok" });
  });

  it("fetches tools on mount", async () => {
    const { result } = renderHook(() => useTools());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockClient.listTools).toHaveBeenCalledTimes(1);
    expect(result.current.tools).toEqual(sampleTools);
  });

  it("sets loading states", async () => {
    let resolve: (v: unknown) => void;
    mockClient.listTools.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useTools());
    expect(result.current.loading).toBe(true);

    await act(async () => resolve!({ tools: sampleTools }));
    expect(result.current.loading).toBe(false);
  });

  it("sets error on failure", async () => {
    mockClient.listTools.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useTools());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it("executeTool calls client.executeTool with request", async () => {
    const { result } = renderHook(() => useTools());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const request = { tool_name: "search", args: { query: "test" } };
    await act(async () => {
      await result.current.executeTool(request);
    });

    expect(mockClient.executeTool).toHaveBeenCalledWith(request);
  });

  it("refresh re-fetches tools", async () => {
    const { result } = renderHook(() => useTools());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockClient.listTools).toHaveBeenCalledTimes(2);
  });
});
