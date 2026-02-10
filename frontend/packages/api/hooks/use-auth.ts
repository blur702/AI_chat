"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import type { ReactNode } from "react";
import { getClient } from "../client";
import React from "react";

interface AuthState {
  token: string | null;
  userId: string | null;
  role: string | null;
  username: string | null;
  screenName: string | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string) => boolean;
  loginWithCredentials: (identifier: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "workstation_token";

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function stateFromPayload(token: string, payload: Record<string, unknown>): AuthState {
  return {
    token,
    userId: (payload.user_id as string) || null,
    role: (payload.role as string) || null,
    username: (payload.username as string) || null,
    screenName: (payload.screen_name as string) || null,
    isAuthenticated: true,
  };
}

const emptyState: AuthState = {
  token: null,
  userId: null,
  role: null,
  username: null,
  screenName: null,
  isAuthenticated: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(emptyState);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      const payload = parseJwt(stored);
      if (payload && payload.exp && (payload.exp as number) * 1000 > Date.now()) {
        setState(stateFromPayload(stored, payload));
        getClient().setToken(stored);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }, []);

  const login = useCallback((token: string): boolean => {
    const payload = parseJwt(token);
    if (!payload) return false;
    if (payload.exp && (payload.exp as number) * 1000 <= Date.now()) return false;
    localStorage.setItem(TOKEN_KEY, token);
    getClient().setToken(token);
    setState(stateFromPayload(token, payload));
    return true;
  }, []);

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string): Promise<boolean> => {
      try {
        const response = await getClient().login(identifier, password);
        const token = response.access_token;
        localStorage.setItem(TOKEN_KEY, token);
        getClient().setToken(token);
        const payload = parseJwt(token);
        if (payload) {
          setState(stateFromPayload(token, payload));
        } else {
          setState({
            token,
            userId: response.user_id,
            role: response.role,
            username: response.username,
            screenName: response.screen_name,
            isAuthenticated: true,
          });
        }
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    getClient().setToken(null);
    setState(emptyState);
  }, []);

  return React.createElement(
    AuthContext.Provider,
    { value: { ...state, login, loginWithCredentials, logout } },
    children
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
