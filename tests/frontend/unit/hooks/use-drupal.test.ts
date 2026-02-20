import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  getDrupalSite: vi.fn(),
  getDrupalSyncStatus: vi.fn(),
  getDrupalConfig: vi.fn(),
  connectDrupalSite: vi.fn(),
  disconnectDrupalSite: vi.fn(),
  runDrush: vi.fn(),
  pullDrupalSite: vi.fn(),
  pushDrupalConfig: vi.fn(),
  getDrupalContentTypes: vi.fn(),
  listDrupalContent: vi.fn(),
  createDrupalNode: vi.fn(),
  updateDrupalNode: vi.fn(),
  getDrupalStagingStatus: vi.fn(),
  cloneDrupalProduction: vi.fn(),
  pushDrupalToProduction: vi.fn(),
  startDrupalStaging: vi.fn(),
  stopDrupalStaging: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useDrupal } from "@workstation/api/hooks/use-drupal";

const sampleSite = { id: "site1", url: "https://example.com", status: "connected" };
const sampleConfig = { site_name: "Example", theme: "bartik" };
const sampleSyncStatus = { last_sync: "2025-01-01", status: "synced" };

describe("useDrupal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getDrupalSite.mockResolvedValue(sampleSite);
    mockClient.getDrupalSyncStatus.mockResolvedValue(sampleSyncStatus);
    mockClient.getDrupalConfig.mockResolvedValue(sampleConfig);
    mockClient.connectDrupalSite.mockResolvedValue(undefined);
    mockClient.disconnectDrupalSite.mockResolvedValue(undefined);
    mockClient.runDrush.mockResolvedValue({ output: "OK", exit_code: 0 });
    mockClient.pullDrupalSite.mockResolvedValue(undefined);
    mockClient.pushDrupalConfig.mockResolvedValue(undefined);
    mockClient.getDrupalContentTypes.mockResolvedValue([]);
    mockClient.listDrupalContent.mockResolvedValue({ nodes: [] });
    mockClient.createDrupalNode.mockResolvedValue({ uuid: "n1", title: "New" });
    mockClient.updateDrupalNode.mockResolvedValue({ uuid: "n1", title: "Updated" });
    mockClient.getDrupalStagingStatus.mockResolvedValue(null);
    mockClient.cloneDrupalProduction.mockResolvedValue({ status: "cloned" });
    mockClient.pushDrupalToProduction.mockResolvedValue({ status: "pushed" });
    mockClient.startDrupalStaging.mockResolvedValue(undefined);
    mockClient.stopDrupalStaging.mockResolvedValue(undefined);
  });

  it("fetches site info on mount", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));
    expect(mockClient.getDrupalSite).toHaveBeenCalledWith("proj1");
    expect(result.current.site).toEqual(sampleSite);
  });

  it("fetches sync status on mount", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.syncLoading).toBe(false));
    expect(mockClient.getDrupalSyncStatus).toHaveBeenCalledWith("proj1");
    expect(result.current.syncStatus).toEqual(sampleSyncStatus);
  });

  it("auto-fetches config when site is connected", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.config).toEqual(sampleConfig));
    expect(mockClient.getDrupalConfig).toHaveBeenCalledWith("proj1");
  });

  it("connect calls API and refreshes", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    const connectData = { url: "https://new.example.com", username: "admin", password: "pass" };
    await act(async () => {
      await result.current.connect(connectData as never);
    });

    expect(mockClient.connectDrupalSite).toHaveBeenCalledWith("proj1", connectData);
  });

  it("connect sets error on failure", async () => {
    mockClient.connectDrupalSite.mockRejectedValue(new Error("Connection refused"));
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    await act(async () => {
      try {
        await result.current.connect({ url: "bad" } as never);
      } catch {
        // expected - connect re-throws
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it("disconnect clears site state", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.site).toEqual(sampleSite));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockClient.disconnectDrupalSite).toHaveBeenCalledWith("proj1");
    expect(result.current.site).toBeNull();
    expect(result.current.config).toBeNull();
  });

  it("runDrush executes command and sets output", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    await act(async () => {
      await result.current.runDrush("cache:rebuild");
    });

    expect(mockClient.runDrush).toHaveBeenCalledWith("proj1", "cache:rebuild");
    expect(result.current.drushOutput).toEqual({ output: "OK", exit_code: 0 });
  });

  it("pull calls API and refreshes sync status", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    await act(async () => {
      await result.current.pull();
    });

    expect(mockClient.pullDrupalSite).toHaveBeenCalledWith("proj1");
  });

  it("push calls API and refreshes sync status", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    await act(async () => {
      await result.current.push();
    });

    expect(mockClient.pushDrupalConfig).toHaveBeenCalledWith("proj1");
  });

  it("fetchContentTypes loads content types", async () => {
    const types = [{ id: "article", label: "Article" }];
    mockClient.getDrupalContentTypes.mockResolvedValue(types);

    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.contentTypes).toEqual(types));
  });

  it("fetchNodes loads nodes for a bundle", async () => {
    const nodeList = { nodes: [{ uuid: "n1", title: "Test" }] };
    mockClient.listDrupalContent.mockResolvedValue(nodeList);

    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    await act(async () => {
      await result.current.fetchNodes("article");
    });

    expect(mockClient.listDrupalContent).toHaveBeenCalledWith("proj1", "article");
    expect(result.current.nodes).toEqual(nodeList.nodes);
  });

  it("createNode calls API and refreshes nodes", async () => {
    mockClient.listDrupalContent.mockResolvedValue({ nodes: [] });
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    const nodeData = { title: "New Article" };
    await act(async () => {
      await result.current.createNode("article", nodeData as never);
    });

    expect(mockClient.createDrupalNode).toHaveBeenCalledWith("proj1", "article", nodeData);
  });

  it("cloneProduction calls API", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    let cloneResult: unknown;
    await act(async () => {
      cloneResult = await result.current.cloneProduction();
    });

    expect(mockClient.cloneDrupalProduction).toHaveBeenCalledWith("proj1", undefined);
    expect(cloneResult).toEqual({ status: "cloned" });
  });

  it("cloneProduction returns null on error", async () => {
    mockClient.cloneDrupalProduction.mockRejectedValue(new Error("Clone failed"));
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    let cloneResult: unknown;
    await act(async () => {
      cloneResult = await result.current.cloneProduction();
    });

    expect(cloneResult).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("startStaging calls API", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    await act(async () => {
      await result.current.startStaging();
    });

    expect(mockClient.startDrupalStaging).toHaveBeenCalledWith("proj1");
  });

  it("stopStaging calls API", async () => {
    const { result } = renderHook(() => useDrupal("proj1"));
    await waitFor(() => expect(result.current.siteLoading).toBe(false));

    await act(async () => {
      await result.current.stopStaging();
    });

    expect(mockClient.stopDrupalStaging).toHaveBeenCalledWith("proj1");
  });
});
