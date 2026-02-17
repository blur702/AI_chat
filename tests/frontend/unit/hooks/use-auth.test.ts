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
const mockLogout = vi.fn();

vi.mock("@workstation/api/client", () => ({
  getClient: () => ({
    getCurrentUser: mockGetCurrentUser,
    login: mockLogin,
    setToken: mockSetToken,
    logout: mockLogout,
  }),
}));

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
  });

  it("throws error when used outside AuthProvider", () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow();

    spy.mockRestore();
  });

  it("returns initial unauthenticated state", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it("login() parses JWT and sets auth state", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    const validPayload = {
      user_id: "123",
      username: "testuser",
      exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
    };
    const token = makeJwt(validPayload);

    act(() => {
      const success = result.current.login(token);
      expect(success).toBe(true);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({
      id: "123",
      username: "testuser",
    });
    expect(result.current.token).toBe(token);
    expect(mockSetToken).toHaveBeenCalledWith(token);
  });

  it("login() returns false for invalid token", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      const success = result.current.login("invalid-token");
      expect(success).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("login() returns false for expired token", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    const expiredPayload = {
      user_id: "123",
      username: "testuser",
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    };
    const token = makeJwt(expiredPayload);

    act(() => {
      const success = result.current.login(token);
      expect(success).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("loginWithCredentials() calls client.login and sets state", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    const validPayload = {
      user_id: "456",
      username: "newuser",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = makeJwt(validPayload);

    mockLogin.mockResolvedValue({ access_token: token });

    await act(async () => {
      const success = await result.current.loginWithCredentials("newuser", "password123");
      expect(success).toBe(true);
    });

    expect(mockLogin).toHaveBeenCalledWith("newuser", "password123");
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({
      id: "456",
      username: "newuser",
    });
  });

  it("loginWithCredentials() returns false on error", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    mockLogin.mockRejectedValue(new Error("Invalid credentials"));

    await act(async () => {
      const success = await result.current.loginWithCredentials("baduser", "badpass");
      expect(success).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("logout() clears state and calls client.logout", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // First login
    const validPayload = {
      user_id: "789",
      username: "logoutuser",
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
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(mockLogout).toHaveBeenCalled();
  });
});
