import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { usePlanning } from "@workstation/api/hooks/use-planning";

const sampleSessions = [
  { id: "sess1", name: "Session 1", status: "draft" },
  { id: "sess2", name: "Session 2", status: "active" },
];

const sampleSessionDetail = {
  id: "sess1",
  name: "Session 1",
  status: "draft",
  phases: [],
};

const sampleProgress = { total_tasks: 5, completed_tasks: 2, percentage: 40 };

describe("usePlanning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.get.mockImplementation((url: string) => {
      if (url.includes("/progress")) return Promise.resolve({ data: sampleProgress });
      if (url.includes("/sessions/sess1")) return Promise.resolve({ data: sampleSessionDetail });
      if (url.includes("/sessions")) return Promise.resolve({ data: sampleSessions });
      return Promise.resolve({ data: null });
    });
    mockClient.post.mockResolvedValue({ data: sampleSessionDetail });
    mockClient.put.mockResolvedValue({ data: sampleSessionDetail });
    mockClient.delete.mockResolvedValue({ data: null });
  });

  it("loads sessions on mount", async () => {
    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessions).toEqual(sampleSessions);
  });

  it("sets loading during fetch", async () => {
    let resolve: (v: unknown) => void;
    mockClient.get.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => usePlanning("proj1"));
    expect(result.current.loading).toBe(true);

    await act(async () => resolve!({ data: sampleSessions }));
    expect(result.current.loading).toBe(false);
  });

  it("sets error on failure", async () => {
    mockClient.get.mockRejectedValue(new Error("Load failed"));
    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it("loadSession fetches session detail and progress", async () => {
    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadSession("sess1");
    });

    expect(result.current.selectedSession).toEqual(sampleSessionDetail);
    expect(result.current.progress).toEqual(sampleProgress);
  });

  it("createSession calls API and refreshes sessions", async () => {
    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const data = { name: "New Session", project_id: "proj1" };
    await act(async () => {
      await result.current.createSession(data as never);
    });

    expect(mockClient.post).toHaveBeenCalledWith("/planning/sessions", data);
    expect(result.current.selectedSession).toEqual(sampleSessionDetail);
  });

  it("createSession returns null on error", async () => {
    mockClient.post.mockRejectedValue(new Error("Create failed"));
    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: unknown;
    await act(async () => {
      created = await result.current.createSession({ name: "Fail" } as never);
    });

    expect(created).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("archiveSession deletes and clears selectedSession", async () => {
    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.archiveSession("sess1");
    });

    expect(mockClient.delete).toHaveBeenCalledWith("/planning/sessions/sess1");
    expect(result.current.selectedSession).toBeNull();
  });

  it("startSession calls API", async () => {
    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.startSession("sess1");
    });

    expect(mockClient.post).toHaveBeenCalledWith("/planning/sessions/sess1/start");
  });

  it("createPhase posts and reloads session", async () => {
    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const phaseData = { name: "Phase 1", order: 1 };
    await act(async () => {
      await result.current.createPhase("sess1", phaseData as never);
    });

    expect(mockClient.post).toHaveBeenCalledWith("/planning/sessions/sess1/phases", phaseData);
  });

  it("createTask posts to phase endpoint", async () => {
    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Set selectedSession so loadSession is called after
    await act(async () => {
      await result.current.loadSession("sess1");
    });

    const taskData = { title: "Task 1", description: "Do something" };
    await act(async () => {
      await result.current.createTask("phase1", taskData as never);
    });

    expect(mockClient.post).toHaveBeenCalledWith("/planning/phases/phase1/tasks", taskData);
  });

  it("exportToUIBuilder returns ui_tree", async () => {
    const uiTree = [{ type: "div", children: [] }];
    mockClient.post.mockResolvedValue({ data: { ui_tree: uiTree } });

    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let exported: unknown;
    await act(async () => {
      exported = await result.current.exportToUIBuilder("sess1");
    });

    expect(exported).toEqual(uiTree);
  });

  it("exportToUIBuilder returns null on error", async () => {
    mockClient.post.mockRejectedValue(new Error("Export failed"));

    const { result } = renderHook(() => usePlanning("proj1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let exported: unknown;
    await act(async () => {
      exported = await result.current.exportToUIBuilder("sess1");
    });

    expect(exported).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
