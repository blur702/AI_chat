import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockClient = {
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
};
vi.mock("@workstation/api/client", () => ({ getClient: () => mockClient }));

import { useProjects } from "@workstation/api/hooks/use-projects";

const sampleProjects = [
  { id: "p1", name: "Project 1", template_id: "node" },
  { id: "p2", name: "Project 2", template_id: "python" },
];

describe("useProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.listProjects.mockResolvedValue({ projects: sampleProjects });
    mockClient.createProject.mockResolvedValue({ id: "p3", name: "New" });
    mockClient.updateProject.mockResolvedValue({ id: "p1", name: "Updated" });
    mockClient.deleteProject.mockResolvedValue(undefined);
  });

  it("fetches projects on mount", async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockClient.listProjects).toHaveBeenCalledTimes(1);
    expect(result.current.projects).toEqual(sampleProjects);
  });

  it("sets loading=true during fetch", async () => {
    let resolve: (v: unknown) => void;
    mockClient.listProjects.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useProjects());
    expect(result.current.loading).toBe(true);

    await act(async () => resolve!({ projects: sampleProjects }));
    expect(result.current.loading).toBe(false);
  });

  it("sets error on failure", async () => {
    mockClient.listProjects.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.projects).toEqual([]);
  });

  it("createProject calls API and refreshes list", async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createProject({ name: "New", template_id: "node" });
    });

    expect(mockClient.createProject).toHaveBeenCalledWith({ name: "New", template_id: "node" });
    // refresh called after create
    expect(mockClient.listProjects).toHaveBeenCalledTimes(2);
  });

  it("createProject sets error on failure", async () => {
    mockClient.createProject.mockRejectedValue(new Error("Create failed"));
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.createProject({ name: "Fail", template_id: "node" });
      } catch {
        // The hook re-throws the error after setting state
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it("updateProject calls API with id and data", async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateProject("p1", { name: "Updated" });
    });

    expect(mockClient.updateProject).toHaveBeenCalledWith("p1", { name: "Updated" });
  });

  it("deleteProject removes project and refreshes", async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteProject("p1");
    });

    expect(mockClient.deleteProject).toHaveBeenCalledWith("p1");
    expect(mockClient.listProjects).toHaveBeenCalledTimes(2);
  });

  it("deleteProject sets error on failure", async () => {
    mockClient.deleteProject.mockRejectedValue(new Error("Delete failed"));
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.deleteProject("p1");
      } catch {
        // The hook re-throws the error after setting state
      }
    });

    expect(result.current.error).toBeTruthy();
  });
});
