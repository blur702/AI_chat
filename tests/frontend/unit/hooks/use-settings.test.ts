import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSettings } from "@workstation/api/hooks/use-settings";

const mockClient = {
  getCurrentUser: vi.fn(),
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
  listModels: vi.fn(),
};

vi.mock("@workstation/api/client", () => ({
  getClient: () => mockClient,
}));

describe("useSettings", () => {
  const mockUser = { id: "u-1", username: "kevin", screen_name: "Kevin", role: "admin" };
  const mockPrefs = { theme: "dark", language: "en" };
  const mockModels = { models: [{ id: "m-1", name: "llama3.2" }] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getCurrentUser.mockResolvedValue(mockUser);
    mockClient.getUserPreferences.mockResolvedValue(mockPrefs);
    mockClient.listModels.mockResolvedValue(mockModels);
  });

  it("loads user, preferences, and models on mount when userId provided", async () => {
    const { result } = renderHook(() => useSettings("u-1"));

    await waitFor(() => {
      expect(result.current.userLoading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.preferences).toEqual(mockPrefs);
    expect(result.current.models).toEqual(mockModels.models);
  });

  it("skips loading when userId is null", () => {
    const { result } = renderHook(() => useSettings(null));

    expect(result.current.user).toBeNull();
    expect(result.current.preferences).toBeNull();
    expect(mockClient.getCurrentUser).not.toHaveBeenCalled();
  });

  it("updateProfile calls API and updates state", async () => {
    const updatedUser = { ...mockUser, screen_name: "Kevin A" };
    mockClient.updateUser.mockResolvedValue(updatedUser);

    const { result } = renderHook(() => useSettings("u-1"));

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    let res: { success: boolean; error?: string };
    await act(async () => {
      res = await result.current.updateProfile({ screen_name: "Kevin A" });
    });

    expect(res!.success).toBe(true);
    expect(result.current.user?.screen_name).toBe("Kevin A");
    expect(mockClient.updateUser).toHaveBeenCalledWith("u-1", { screen_name: "Kevin A" });
  });

  it("updateProfile returns error on failure", async () => {
    mockClient.updateUser.mockRejectedValue(new Error("Validation error"));

    const { result } = renderHook(() => useSettings("u-1"));

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    let res: { success: boolean; error?: string };
    await act(async () => {
      res = await result.current.updateProfile({ screen_name: "" });
    });

    expect(res!.success).toBe(false);
    expect(res!.error).toBe("Validation error");
  });

  it("changePassword calls API", async () => {
    mockClient.changePassword.mockResolvedValue({ message: "Password changed" });

    const { result } = renderHook(() => useSettings("u-1"));

    let res: { success: boolean; error?: string };
    await act(async () => {
      res = await result.current.changePassword("old-pass", "new-pass");
    });

    expect(res!.success).toBe(true);
    expect(mockClient.changePassword).toHaveBeenCalledWith("old-pass", "new-pass");
  });

  it("changePassword returns error on failure", async () => {
    mockClient.changePassword.mockRejectedValue(new Error("Wrong password"));

    const { result } = renderHook(() => useSettings("u-1"));

    let res: { success: boolean; error?: string };
    await act(async () => {
      res = await result.current.changePassword("wrong", "new-pass");
    });

    expect(res!.success).toBe(false);
    expect(res!.error).toBe("Wrong password");
  });

  it("updatePreferences calls API and updates state", async () => {
    const updatedPrefs = { theme: "light", language: "en" };
    mockClient.updateUserPreferences.mockResolvedValue(updatedPrefs);

    const { result } = renderHook(() => useSettings("u-1"));

    await waitFor(() => {
      expect(result.current.preferences).not.toBeNull();
    });

    let res: { success: boolean; error?: string };
    await act(async () => {
      res = await result.current.updatePreferences({ theme: "light" });
    });

    expect(res!.success).toBe(true);
    expect(result.current.preferences).toEqual(updatedPrefs);
  });

  it("updatePreferences returns error when userId is null", async () => {
    const { result } = renderHook(() => useSettings(null));

    let res: { success: boolean; error?: string };
    await act(async () => {
      res = await result.current.updatePreferences({ theme: "dark" });
    });

    expect(res!.success).toBe(false);
    expect(res!.error).toBe("Not authenticated");
  });

  it("profileSaving is false after updateProfile completes", async () => {
    mockClient.updateUser.mockResolvedValue(mockUser);

    const { result } = renderHook(() => useSettings("u-1"));

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    await act(async () => {
      await result.current.updateProfile({ screen_name: "Test" });
    });

    expect(result.current.profileSaving).toBe(false);
  });
});
