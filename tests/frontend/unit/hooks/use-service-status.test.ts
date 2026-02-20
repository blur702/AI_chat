import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useServiceStatus } from "@workstation/api/hooks/use-service-status";

const mockClient = {
  kernelStatus: vi.fn(),
};

vi.mock("@workstation/api/client", () => ({
  getClient: () => mockClient,
}));

describe("useServiceStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets backendReachable=true after successful poll", async () => {
    mockClient.kernelStatus.mockResolvedValue({
      status: "ok",
      service_details: {
        ollama_client: { healthy: true, is_running: true },
        comfyui_client: { healthy: true, is_running: true },
        embedding_service: { healthy: true, is_running: true },
        resource_manager: { healthy: true, is_running: true },
      },
    });

    const { result } = renderHook(() => useServiceStatus());

    // Let initial poll resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.backendReachable).toBe(true);
  });

  it("sets backendReachable=false when poll fails", async () => {
    mockClient.kernelStatus.mockRejectedValue(new Error("Connection refused"));

    const { result } = renderHook(() => useServiceStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.backendReachable).toBe(false);
  });

  it("criticalServicesReady=true when ollama_client is healthy", async () => {
    mockClient.kernelStatus.mockResolvedValue({
      status: "ok",
      service_details: {
        ollama_client: { healthy: true, is_running: true },
        comfyui_client: { healthy: false, is_running: false },
        embedding_service: { healthy: false, is_running: false },
        resource_manager: { healthy: false, is_running: false },
      },
    });

    const { result } = renderHook(() => useServiceStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.criticalServicesReady).toBe(true);
    expect(result.current.allServicesReady).toBe(false);
  });

  it("allServicesReady=true when all tracked services healthy", async () => {
    mockClient.kernelStatus.mockResolvedValue({
      status: "ok",
      service_details: {
        ollama_client: { healthy: true, is_running: true },
        comfyui_client: { healthy: true, is_running: true },
        embedding_service: { healthy: true, is_running: true },
        resource_manager: { healthy: true, is_running: true },
      },
    });

    const { result } = renderHook(() => useServiceStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.allServicesReady).toBe(true);
  });

  it("provides per-service status with labels", async () => {
    mockClient.kernelStatus.mockResolvedValue({
      status: "ok",
      service_details: {
        ollama_client: { healthy: true, is_running: true },
        comfyui_client: { healthy: false, is_running: true },
        embedding_service: { healthy: true, is_running: true },
        resource_manager: { healthy: true, is_running: true },
      },
    });

    const { result } = renderHook(() => useServiceStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.services).toHaveLength(4);

    const ollama = result.current.services.find((s) => s.name === "ollama_client");
    expect(ollama?.label).toBe("Ollama");
    expect(ollama?.detail?.healthy).toBe(true);

    const comfyui = result.current.services.find((s) => s.name === "comfyui_client");
    expect(comfyui?.label).toBe("ComfyUI");
    expect(comfyui?.detail?.healthy).toBe(false);
  });

  it("unreachableDuration is 0 when backend reachable", async () => {
    mockClient.kernelStatus.mockResolvedValue({
      status: "ok",
      service_details: { ollama_client: { healthy: true } },
    });

    const { result } = renderHook(() => useServiceStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.unreachableDuration).toBe(0);
  });

  it("criticalServicesReady=false when ollama is not healthy", async () => {
    mockClient.kernelStatus.mockResolvedValue({
      status: "ok",
      service_details: {
        ollama_client: { healthy: false, is_running: false },
      },
    });

    const { result } = renderHook(() => useServiceStatus());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.criticalServicesReady).toBe(false);
  });
});
