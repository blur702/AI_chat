import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth, AuthProvider } from "@workstation/api/hooks/use-auth";
import type { ReactNode } from "react";

// Helper to create test JWTs
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

// Mock client
const mockGetCurrentUser = vi.fn();
const mockLogin = vi.fn();
const mockSetToken = vi.fn();
const mockLogout = vi.fn().mockResolvedValue(undefined);

vi.mock("@workstation/api/client", () => ({
  getClient: () => ({
    getCurrentUser: mockGetCurrentUser,
    login: mockLogin,
    setToken: mockSetToken,
    logout: mockLogout,
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockRejectedValue(new Error("no session"));
    localStorage.clear();
  });

  it("throws error when used outside AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within AuthProvider");
    spy.mockRestore();
  });

  it("returns initial unauthenticated state", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.userId).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.username).toBeNull();
  });

  it("login() parses JWT and sets auth state", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    const validPayload = {
      user_id: "123",
      username: "testuser",
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = makeJwt(validPayload);

    act(() => {
      const success = result.current.login(token);
      expect(success).toBe(true);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.userId).toBe("123");
    expect(result.current.username).toBe("testuser");
    expect(result.current.role).toBe("admin");
    expect(result.current.token).toBe(token);
    expect(mockSetToken).toHaveBeenCalledWith(token);
  });

  it("login() returns false for invalid token", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      const success = result.current.login("invalid-token");
      expect(success).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
  });

  it("login() returns false for expired token", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    const expiredPayload = {
      user_id: "123",
      username: "testuser",
      exp: Math.floor(Date.now() / 1000) - 3600,
    };
    const token = makeJwt(expiredPayload);

    act(() => {
      const success = result.current.login(token);
      expect(success).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
  });

  it("loginWithCredentials() calls client.login and sets state", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    const validPayload = {
      user_id: "456",
      username: "newuser",
      role: "user",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = makeJwt(validPayload);

    mockLogin.mockResolvedValue({
      access_token: token,
      user_id: "456",
      username: "newuser",
      role: "user",
      screen_name: "New User",
    });

    await act(async () => {
      const success = await result.current.loginWithCredentials("newuser", "password123");
      expect(success).toBe(true);
    });

    expect(mockLogin).toHaveBeenCalledWith("newuser", "password123");
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.userId).toBe("456");
    expect(result.current.username).toBe("newuser");
  });

  it("loginWithCredentials() returns false on error", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    mockLogin.mockRejectedValue(new Error("Invalid credentials"));

    await act(async () => {
      const success = await result.current.loginWithCredentials("baduser", "badpass");
      expect(success).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
  });

  it("logout() clears state and calls client.logout", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // First login
    const validPayload = {
      user_id: "789",
      username: "logoutuser",
      role: "user",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = makeJwt(validPayload);

    act(() => {
      result.current.login(token);
    });
    expect(result.current.isAuthenticated).toBe(true);

    // Then logout
    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.userId).toBeNull();
    expect(result.current.token).toBeNull();
    expect(mockLogout).toHaveBeenCalled();
  });
});
