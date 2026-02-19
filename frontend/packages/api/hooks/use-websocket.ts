"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { WebSocketMessage } from "../types";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error" | "exhausted";
type MessageHandler = (message: WebSocketMessage) => void;

interface UseWebSocketOptions {
  token: string | null;
  baseUrl?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  lastMessage: WebSocketMessage | null;
  subscribe: (eventType: string, handler: MessageHandler) => () => void;
  send: (data: unknown) => void;
  connect: () => void;
  disconnect: () => void;
  resetReconnect: () => void;
}

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp) return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

/**
 * Manages a persistent WebSocket connection to the backend event bus with auto-reconnect.
 * Supports typed event subscriptions and a wildcard `"*"` handler for all messages.
 * @param options - Connection options including `token`, `baseUrl`, and reconnect settings.
 * @returns Connection status, last message, subscribe/send functions, and manual connect/disconnect controls.
 * @example
 * const { status, subscribe } = useWebSocket({ token });
 * useEffect(() => subscribe("kernel_event", (msg) => console.log(msg)), [subscribe]);
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    token,
    baseUrl,
    autoConnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 6,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getWsUrl = useCallback(() => {
    if (baseUrl) {
      return `${baseUrl}/api/ws/events?token=${token}`;
    }
    const envUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (envUrl) {
      return `${envUrl}/api/ws/events?token=${token}`;
    }
    // Derive WebSocket URL from current page origin
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/ws/events?token=${token}`;
  }, [baseUrl, token]);

  const connect = useCallback(() => {
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("disconnected");
      return;
    }
    if (isJwtExpired(token)) {
      reconnectCountRef.current = maxReconnectAttempts;
      setStatus("exhausted");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth-token-expired"));
      }
      return;
    }

    setStatus("connecting");
    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      setStatus("connected");
      reconnectCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        setLastMessage(message);

        // Dispatch to type-specific subscribers
        const handlers = subscribersRef.current.get(message.type);
        if (handlers) {
          handlers.forEach((handler) => handler(message));
        }
        // Dispatch to wildcard subscribers
        const wildcardHandlers = subscribersRef.current.get("*");
        if (wildcardHandlers) {
          wildcardHandlers.forEach((handler) => handler(message));
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      if (event.code === 1008) {
        setStatus("exhausted");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("auth-token-expired"));
        }
        return;
      }
      if (!token || isJwtExpired(token)) {
        setStatus("exhausted");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("auth-token-expired"));
        }
        return;
      }

      // Auto-reconnect with exponential backoff
      if (
        reconnectCountRef.current < maxReconnectAttempts &&
        token
      ) {
        setStatus("disconnected");
        const delay = reconnectInterval * Math.pow(2, reconnectCountRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectCountRef.current++;
          connect();
        }, Math.min(delay, 30000));
      } else {
        // Max attempts exhausted
        setStatus("exhausted");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ws-reconnect-exhausted"));
        }
      }
    };

    ws.onerror = () => {
      setStatus("error");
    };

    wsRef.current = ws;
  }, [token, getWsUrl, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectCountRef.current = maxReconnectAttempts; // Prevent auto-reconnect
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, [maxReconnectAttempts]);

  const resetReconnect = useCallback(() => {
    reconnectCountRef.current = 0;
    connect();
  }, [connect]);

  const subscribe = useCallback(
    (eventType: string, handler: MessageHandler): (() => void) => {
      if (!subscribersRef.current.has(eventType)) {
        subscribersRef.current.set(eventType, new Set());
      }
      subscribersRef.current.get(eventType)!.add(handler);

      return () => {
        subscribersRef.current.get(eventType)?.delete(handler);
      };
    },
    []
  );

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // Auto-connect
  useEffect(() => {
    if (autoConnect && token) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, token, connect, disconnect]);

  return { status, lastMessage, subscribe, send, connect, disconnect, resetReconnect };
}
