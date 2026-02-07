"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import type { ReactNode } from "react";
import { getClient } from "../client";
import React from "react";

interface AuthState {
  token: string | null;
  userId: string | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string) => boolean;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    userId: null,
    isAuthenticated: false,
  });

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      const payload = parseJwt(stored);
      if (payload && payload.exp && (payload.exp as number) * 1000 > Date.now()) {
        setState({
          token: stored,
          userId: (payload.user_id as string) || null,
          isAuthenticated: true,
        });
        getClient().setToken(stored);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }, []);

  const login = useCallback((token: string): boolean => {
    const payload = parseJwt(token);
    if (!payload) {
      return false;
    }
    if (payload.exp && (payload.exp as number) * 1000 <= Date.now()) {
      return false;
    }
    localStorage.setItem(TOKEN_KEY, token);
    getClient().setToken(token);
    setState({
      token,
      userId: (payload.user_id as string) || null,
      isAuthenticated: true,
    });
    return true;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    getClient().setToken(null);
    setState({ token: null, userId: null, isAuthenticated: false });
  }, []);

  return React.createElement(
    AuthContext.Provider,
    { value: { ...state, login, logout } },
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
