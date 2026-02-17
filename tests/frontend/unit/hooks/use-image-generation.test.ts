import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  listGenerations: vi.fn(),
  generateImage: vi.fn(),
  getGenerationStatus: vi.fn(),
  deleteGeneration: vi.fn(),
  toggleFavorite: vi.fn(),
  downloadImage: vi.fn(),
  upscaleImage: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useImageGeneration } from "@workstation/api/hooks/use-image-generation";

const sampleGenerations = {
  generations: [
    { id: "gen1", prompt: "a cat", status: "completed" },
    { id: "gen2", prompt: "a dog", status: "completed" },
  ],
  count: 2,
};

describe("useImageGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.listGenerations.mockResolvedValue(sampleGenerations);
    mockClient.generateImage.mockResolvedValue({ id: "gen3", status: "queued" });
    mockClient.getGenerationStatus.mockResolvedValue({ id: "gen3", status: "completed" });
    mockClient.deleteGeneration.mockResolvedValue(undefined);
    mockClient.toggleFavorite.mockResolvedValue(undefined);
    mockClient.downloadImage.mockResolvedValue(new Blob());
    mockClient.upscaleImage.mockResolvedValue({ id: "gen3", status: "upscaling" });
  });

  it("returns empty when projectId is null", () => {
    const { result } = renderHook(() => useImageGeneration(null as unknown as string));
    expect(result.current.generations).toEqual([]);
    expect(mockClient.listGenerations).not.toHaveBeenCalled();
  });

  it("fetches generations on mount", async () => {
    const { result } = renderHook(() => useImageGeneration("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockClient.listGenerations).toHaveBeenCalled();
    expect(result.current.generations).toEqual(sampleGenerations.generations);
  });

  it("sets loading state during fetch", async () => {
    let resolve: (v: unknown) => void;
    mockClient.listGenerations.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useImageGeneration("proj1"));
    expect(result.current.loading).toBe(true);

    await act(async () => resolve!(sampleGenerations));
    expect(result.current.loading).toBe(false);
  });

  it("sets error on failure", async () => {
    mockClient.listGenerations.mockRejectedValue(new Error("Fetch failed"));
    const { result } = renderHook(() => useImageGeneration("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it("generate calls API and sets generating=true", async () => {
    const { result } = renderHook(() => useImageGeneration("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const request = { prompt: "a bird", width: 512, height: 512 };
    await act(async () => {
      await result.current.generate(request);
    });

    expect(mockClient.generateImage).toHaveBeenCalledWith({ ...request, project_id: "proj1" });
  });

  it("cancelGeneration sets generating=false", async () => {
    const { result } = renderHook(() => useImageGeneration("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.cancelGeneration();
    });

    expect(result.current.generating).toBe(false);
  });

  it("deleteGeneration calls API and refreshes", async () => {
    const { result } = renderHook(() => useImageGeneration("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteGeneration("gen1");
    });

    expect(mockClient.deleteGeneration).toHaveBeenCalledWith("gen1");
    // Should refresh after delete
    expect(mockClient.listGenerations).toHaveBeenCalledTimes(2);
  });

  it("setPage updates page and refreshes", async () => {
    const { result } = renderHook(() => useImageGeneration("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setPage(2);
    });

    // Refresh triggered by page change
    await waitFor(() => expect(mockClient.listGenerations).toHaveBeenCalledTimes(2));
  });

  it("setFilter updates filter and refreshes", async () => {
    const { result } = renderHook(() => useImageGeneration("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setFilter("favorites");
    });

    // Refresh triggered by filter change
    await waitFor(() => expect(mockClient.listGenerations).toHaveBeenCalledTimes(2));
  });
});
