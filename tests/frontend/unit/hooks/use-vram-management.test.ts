import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockClient = {
  getVRAMStats: vi.fn(),
  getResourceStatus: vi.fn(),
  submitOffloadDecision: vi.fn(),
  reloadResource: vi.fn(),
};

vi.mock("@workstation/api/client", () => ({
  getClient: () => mockClient,
}));

const mockRefreshModels = vi.fn().mockResolvedValue(undefined);
const mockLoadModel = vi.fn().mockResolvedValue(true);
const mockUnloadModel = vi.fn().mockResolvedValue(true);

vi.mock("@workstation/api/hooks/use-model-switcher", () => ({
  useModelSwitcher: () => ({
    models: mockModels,
    runningModels: mockRunningModels,
    loadModel: mockLoadModel,
    unloadModel: mockUnloadModel,
    refresh: mockRefreshModels,
    actionLoading: null,
    loading: mockModelLoading,
    error: mockModelError,
  }),
}));

// Track calls to usePolling to return different values per invocation
let pollingCallIndex = 0;
const mockRefreshVram = vi.fn().mockResolvedValue(undefined);
const mockRefreshResourceStatus = vi.fn().mockResolvedValue(undefined);

vi.mock("@workstation/api/hooks/use-polling", () => ({
  usePolling: (opts: any) => {
    const idx = pollingCallIndex++;
    if (idx % 2 === 0) {
      // First call: VRAM stats
      return {
        data: mockVramData,
        error: mockVramError,
        refresh: mockRefreshVram,
        isPolling: true,
        isTimedOut: false,
        cancel: vi.fn(),
      };
    }
    // Second call: resource status
    return {
      data: mockResourceStatus,
      error: mockResourceError,
      refresh: mockRefreshResourceStatus,
      isPolling: true,
      isTimedOut: false,
      cancel: vi.fn(),
    };
  },
}));

vi.mock("@workstation/api/utils/error", () => ({
  extractErrorMessage: (err: any, fallback: string) =>
    err?.message ?? fallback,
}));

/* ------------------------------------------------------------------ */
/*  Mutable state for tests                                            */
/* ------------------------------------------------------------------ */

let mockModels: any[] = [];
let mockRunningModels: any[] = [];
let mockModelLoading = false;
let mockModelError: string | null = null;
let mockVramData: any = null;
let mockVramError: any = null;
let mockResourceStatus: any = null;
let mockResourceError: any = null;

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

import { useVramManagement } from "@workstation/api/hooks/use-vram-management";

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("useVramManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pollingCallIndex = 0;
    mockModels = [
      { name: "llama3.2", size: 4_000_000_000 },
      { name: "mistral", size: 7_000_000_000 },
    ];
    mockRunningModels = [{ name: "llama3.2", size_vram: 3_500_000_000 }];
    mockModelLoading = false;
    mockModelError = null;
    mockVramData = {
      total_mb: 24576,
      used_mb: 8192,
      free_mb: 16384,
      utilization_percent: 33.33,
      gpu_count: 1,
      per_gpu: [
        {
          gpu_index: 0,
          name: "NVIDIA GeForce RTX 4090",
          total_mb: 24576,
          used_mb: 8192,
          free_mb: 16384,
          utilization_percent: 33.33,
        },
      ],
    };
    mockVramError = null;
    mockResourceStatus = {
      offloaded_resources: [],
      system_stats: { ram_used_mb: 16000, ram_total_mb: 64000 },
    };
    mockResourceError = null;
  });

  it("gpus derives from vramData.per_gpu", () => {
    const { result } = renderHook(() => useVramManagement());
    expect(result.current.gpus).toHaveLength(1);
    expect(result.current.gpus[0].name).toBe("NVIDIA GeForce RTX 4090");
  });

  it("gpus empty when per_gpu absent", () => {
    mockVramData = { total_mb: 0, used_mb: 0, free_mb: 0, utilization_percent: 0, gpu_count: 0 };
    const { result } = renderHook(() => useVramManagement());
    expect(result.current.gpus).toEqual([]);
  });

  it("localModels excludes running models", () => {
    const { result } = renderHook(() => useVramManagement());
    expect(result.current.localModels).toHaveLength(1);
    expect(result.current.localModels[0].name).toBe("mistral");
  });

  it("offloadedResources from resourceStatus", () => {
    const resource = { resource_id: "offloaded-model", vram_mb: 4096 };
    mockResourceStatus = {
      offloaded_resources: [resource],
      system_stats: null,
    };
    const { result } = renderHook(() => useVramManagement());
    expect(result.current.offloadedResources).toEqual([resource]);
  });

  it("systemStats from resourceStatus", () => {
    const stats = { ram_used_mb: 16000, ram_total_mb: 64000 };
    mockResourceStatus = { offloaded_resources: [], system_stats: stats };
    const { result } = renderHook(() => useVramManagement());
    expect(result.current.systemStats).toEqual(stats);
  });

  it("offloadToRam calls submitOffloadDecision", async () => {
    mockClient.submitOffloadDecision.mockResolvedValue({
      success: true,
      message: "ok",
      preempted_resources: null,
    });
    const { result } = renderHook(() => useVramManagement());

    await act(async () => {
      await result.current.offloadToRam("model-a", "user-1");
    });

    expect(mockClient.submitOffloadDecision).toHaveBeenCalledWith({
      resource_id: "model-a",
      user_id: "user-1",
      decision: "offload",
      remember: false,
    });
  });

  it("offloadToRam sets error on failure", async () => {
    mockClient.submitOffloadDecision.mockRejectedValue(
      new Error("offload failed"),
    );
    const { result } = renderHook(() => useVramManagement());

    await act(async () => {
      try {
        await result.current.offloadToRam("model-a", "user-1");
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe("offload failed");
  });

  it("reloadFromRam calls reloadResource", async () => {
    mockClient.reloadResource.mockResolvedValue({
      success: true,
      message: "ok",
      preempted_resources: null,
    });
    const { result } = renderHook(() => useVramManagement());

    await act(async () => {
      await result.current.reloadFromRam("model-a", 8192, "user-1");
    });

    expect(mockClient.reloadResource).toHaveBeenCalledWith({
      resource_id: "model-a",
      estimated_vram_mb: 8192,
      user_id: "user-1",
    });
  });

  it("reloadFromRam sets error on failure", async () => {
    mockClient.reloadResource.mockRejectedValue(
      new Error("reload failed"),
    );
    const { result } = renderHook(() => useVramManagement());

    await act(async () => {
      try {
        await result.current.reloadFromRam("model-a", 8192);
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe("reload failed");
  });

  it("refresh calls all three refresh fns", async () => {
    const { result } = renderHook(() => useVramManagement());

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockRefreshModels).toHaveBeenCalled();
    expect(mockRefreshVram).toHaveBeenCalled();
    expect(mockRefreshResourceStatus).toHaveBeenCalled();
  });

  it("loading true while vramData null", () => {
    mockVramData = null;
    const { result } = renderHook(() => useVramManagement());
    expect(result.current.loading).toBe(true);
  });

  it("error priority: localError > modelError > vramError > resourceError", () => {
    // When no local error, model error wins
    mockModelError = "model error";
    mockVramError = new Error("vram error");
    mockResourceError = new Error("resource error");
    const { result } = renderHook(() => useVramManagement());
    expect(result.current.error).toBe("model error");
  });

  it("vramError surfaces when no local or model error", () => {
    mockVramError = new Error("vram error");
    const { result } = renderHook(() => useVramManagement());
    expect(result.current.error).toBe("vram error");
  });

  it("vramStats returns full vram data", () => {
    const { result } = renderHook(() => useVramManagement());
    expect(result.current.vramStats).toBe(mockVramData);
  });
});
