import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useModelSwitcher, ACTIVE_MODEL_KEY } from "@workstation/api/hooks/use-model-switcher";

const mockClient = {
  listOllamaModels: vi.fn(),
  loadOllamaModel: vi.fn(),
  unloadOllamaModel: vi.fn(),
  pullOllamaModel: vi.fn(),
  deleteOllamaModel: vi.fn(),
};

vi.mock("@workstation/api/client", () => ({
  getClient: () => mockClient,
}));

describe("useModelSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockClient.listOllamaModels.mockResolvedValue({
      local: [{ name: "llama3.2", size: 4000000000 }],
      running: [{ name: "llama3.2", size_vram: 3500000000 }],
      remote: [{ name: "gpt-4", provider: "openai" }],
    });
  });

  it("fetches models on mount", async () => {
    const { result } = renderHook(() => useModelSwitcher());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.models).toHaveLength(1);
    expect(result.current.models[0].name).toBe("llama3.2");
    expect(result.current.runningModels).toHaveLength(1);
    expect(result.current.remoteModels).toHaveLength(1);
  });

  it("reads activeModel from localStorage on init", () => {
    localStorage.setItem(ACTIVE_MODEL_KEY, "llama3.2");
    const { result } = renderHook(() => useModelSwitcher());
    expect(result.current.activeModel).toBe("llama3.2");
  });

  it("setActiveModel persists to localStorage", async () => {
    const { result } = renderHook(() => useModelSwitcher());

    act(() => {
      result.current.setActiveModel("gpt-4");
    });

    expect(result.current.activeModel).toBe("gpt-4");
    expect(localStorage.getItem(ACTIVE_MODEL_KEY)).toBe("gpt-4");
  });

  it("setActiveModel dispatches custom event", async () => {
    const handler = vi.fn();
    window.addEventListener("active-model-change", handler);

    const { result } = renderHook(() => useModelSwitcher());

    act(() => {
      result.current.setActiveModel("llama3.2");
    });

    expect(handler).toHaveBeenCalled();
    window.removeEventListener("active-model-change", handler);
  });

  it("loadModel calls API and refreshes", async () => {
    mockClient.loadOllamaModel.mockResolvedValue(undefined);

    const { result } = renderHook(() => useModelSwitcher());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.loadModel("llama3.2");
    });

    expect(success).toBe(true);
    expect(mockClient.loadOllamaModel).toHaveBeenCalledWith("llama3.2");
  });

  it("loadModel returns false on error", async () => {
    mockClient.loadOllamaModel.mockRejectedValue(new Error("Out of VRAM"));

    const { result } = renderHook(() => useModelSwitcher());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let success = true;
    await act(async () => {
      success = await result.current.loadModel("llama3.2");
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Out of VRAM");
  });

  it("unloadModel calls API and refreshes", async () => {
    mockClient.unloadOllamaModel.mockResolvedValue(undefined);

    const { result } = renderHook(() => useModelSwitcher());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.unloadModel("llama3.2");
    });

    expect(success).toBe(true);
    expect(mockClient.unloadOllamaModel).toHaveBeenCalledWith("llama3.2");
  });

  it("deleteModel calls API and clears activeModel if deleted", async () => {
    localStorage.setItem(ACTIVE_MODEL_KEY, "llama3.2");
    mockClient.deleteOllamaModel.mockResolvedValue(undefined);

    const { result } = renderHook(() => useModelSwitcher());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.activeModel).toBe("llama3.2");

    await act(async () => {
      await result.current.deleteModel("llama3.2");
    });

    expect(result.current.activeModel).toBeNull();
    expect(mockClient.deleteOllamaModel).toHaveBeenCalledWith("llama3.2");
  });

  it("isModelRunning returns true for running model", async () => {
    const { result } = renderHook(() => useModelSwitcher());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isModelRunning("llama3.2")).toBe(true);
    expect(result.current.isModelRunning("nonexistent")).toBe(false);
  });

  it("getModelVramMb returns VRAM in MB for running model", async () => {
    const { result } = renderHook(() => useModelSwitcher());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const vram = result.current.getModelVramMb("llama3.2");
    expect(vram).toBe(Math.round(3500000000 / (1024 * 1024)));
  });

  it("getModelVramMb returns null for non-running model", async () => {
    const { result } = renderHook(() => useModelSwitcher());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.getModelVramMb("nonexistent")).toBeNull();
  });

  it("sets error on fetch failure", async () => {
    mockClient.listOllamaModels.mockRejectedValue(new Error("Connection refused"));

    const { result } = renderHook(() => useModelSwitcher());

    await waitFor(() => {
      expect(result.current.error).toBe("Connection refused");
    });
  });
});
