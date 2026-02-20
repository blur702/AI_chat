import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  getKernelMetrics: vi.fn(),
  getKernelDebug: vi.fn(),
  getServiceDebug: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useAdmin } from "@workstation/api/hooks/use-admin";

const sampleMetrics = {
  uptime: 3600,
  total_requests: 1000,
  active_connections: 5,
};

const sampleDebugInfo = {
  services: { ollama: { status: "running" } },
  version: "1.0.0",
};

describe("useAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockClient.getKernelMetrics.mockResolvedValue(sampleMetrics);
    mockClient.getKernelDebug.mockResolvedValue(sampleDebugInfo);
    mockClient.getServiceDebug.mockResolvedValue({ status: "healthy" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches metrics and debug info on mount", async () => {
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockClient.getKernelMetrics).toHaveBeenCalled();
    expect(mockClient.getKernelDebug).toHaveBeenCalled();
    expect(result.current.metrics).toEqual(sampleMetrics);
    expect(result.current.debugInfo).toEqual(sampleDebugInfo);
  });

  it("sets lastUpdated after fetch", async () => {
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.lastUpdated).not.toBeNull());
  });

  it("sets metricsError on metrics failure", async () => {
    mockClient.getKernelMetrics.mockRejectedValue(new Error("Metrics failed"));
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.metricsError).toBeTruthy());
  });

  it("sets debugError on debug failure", async () => {
    mockClient.getKernelDebug.mockRejectedValue(new Error("Debug failed"));
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.debugError).toBeTruthy());
  });

  it("refreshMetrics re-fetches metrics", async () => {
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));
    mockClient.getKernelMetrics.mockClear();

    await act(async () => {
      await result.current.refreshMetrics();
    });

    expect(mockClient.getKernelMetrics).toHaveBeenCalledTimes(1);
  });

  it("refreshDebugInfo re-fetches debug info", async () => {
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));
    mockClient.getKernelDebug.mockClear();

    await act(async () => {
      await result.current.refreshDebugInfo();
    });

    expect(mockClient.getKernelDebug).toHaveBeenCalledTimes(1);
  });

  it("getServiceDebug calls client", async () => {
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let debugResult: unknown;
    await act(async () => {
      debugResult = await result.current.getServiceDebug("ollama");
    });

    expect(mockClient.getServiceDebug).toHaveBeenCalledWith("ollama");
    expect(debugResult).toEqual({ status: "healthy" });
  });

  it("autoRefresh defaults to disabled", async () => {
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.autoRefreshEnabled).toBe(false);
    expect(result.current.autoRefreshInterval).toBe(10000);
  });

  it("enabling autoRefresh triggers periodic fetches", async () => {
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));
    mockClient.getKernelMetrics.mockClear();
    mockClient.getKernelDebug.mockClear();

    act(() => {
      result.current.setAutoRefreshEnabled(true);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(mockClient.getKernelMetrics).toHaveBeenCalled();
    expect(mockClient.getKernelDebug).toHaveBeenCalled();
  });

  it("disabling autoRefresh stops periodic fetches", async () => {
    const { result } = renderHook(() => useAdmin());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setAutoRefreshEnabled(true);
    });

    act(() => {
      result.current.setAutoRefreshEnabled(false);
    });

    mockClient.getKernelMetrics.mockClear();
    mockClient.getKernelDebug.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(mockClient.getKernelMetrics).not.toHaveBeenCalled();
    expect(mockClient.getKernelDebug).not.toHaveBeenCalled();
  });
});
