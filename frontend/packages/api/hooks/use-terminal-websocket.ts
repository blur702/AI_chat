"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalMessage } from "../types";

export type TerminalStatus = "disconnected" | "connecting" | "connected" | "exhausted";

interface UseTerminalWebSocketOptions {
  projectId: string;
  token: string | null;
  onOutput: (stream: string, content: string) => void;
  onExit: (code: number) => void;
  onError?: (message: string) => void;
  onConnected?: (containerId: string) => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

function getWsBaseUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  if (apiUrl) {
    return apiUrl.replace(/^http/, "ws");
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return "";
}

/**
 * Manages a WebSocket connection to the sandbox terminal, with up to 3 auto-reconnect attempts.
 * Dispatches output, exit, error, and connected events via stable callback refs.
 * @param options - Terminal WebSocket options including `projectId`, `token`, and event callbacks.
 * @returns Connection status, `sendCommand`, and manual `connect`/`disconnect` controls.
 */
export function useTerminalWebSocket({
  projectId,
  token,
  onOutput,
  onExit,
  onError,
  onConnected,
}: UseTerminalWebSocketOptions) {
  const [status, setStatus] = useState<TerminalStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs for callbacks to avoid reconnect on every render
  const onOutputRef = useRef(onOutput);
  const onExitRef = useRef(onExit);
  const onErrorRef = useRef(onError);
  const onConnectedRef = useRef(onConnected);
  onOutputRef.current = onOutput;
  onExitRef.current = onExit;
  onErrorRef.current = onError;
  onConnectedRef.current = onConnected;

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!token || !projectId) return;

    cleanup();
    setStatus("connecting");

    const base = getWsBaseUrl();
    const url = `${base}/api/ws/sandbox/${projectId}/terminal?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg: TerminalMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "connected":
            setStatus("connected");
            if (msg.data.container_id) {
              onConnectedRef.current?.(msg.data.container_id);
            }
            break;
          case "output":
            if (msg.data.stream && msg.data.content !== undefined) {
              onOutputRef.current(msg.data.stream, msg.data.content);
            }
            break;
          case "exit":
            if (msg.data.code !== undefined) {
              onExitRef.current(msg.data.code);
            }
            break;
          case "error":
            onErrorRef.current?.(msg.data.message ?? "Unknown error");
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;

      // Auto-reconnect
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        setStatus("disconnected");
        reconnectAttempts.current += 1;
        reconnectTimer.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS * reconnectAttempts.current);
      } else {
        setStatus("exhausted");
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [token, projectId, cleanup]);

  const disconnect = useCallback(() => {
    reconnectAttempts.current = MAX_RECONNECT_ATTEMPTS; // prevent auto-reconnect
    cleanup();
    setStatus("disconnected");
  }, [cleanup]);

  const sendCommand = useCallback((command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "command", data: { command } })
      );
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (token && projectId) {
      reconnectAttempts.current = 0;
      connect();
    } else {
      disconnect();
    }
    return () => {
      disconnect();
    };
  }, [token, projectId, connect, disconnect]);

  return { status, sendCommand, connect, disconnect };
}
