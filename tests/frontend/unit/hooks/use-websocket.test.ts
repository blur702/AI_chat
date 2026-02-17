import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "@workstation/api/hooks/use-websocket";

// Track WebSocket instances
let lastWsInstance: any = null;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    setTimeout(() => this.onclose?.({}), 0);
  });
  constructor(url: string) {
    this.url = url;
    lastWsInstance = this;
  }
  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as any);
  }
  simulateMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) } as any);
  }
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as any);
  }
  simulateError() {
    this.onerror?.({} as any);
  }
}

describe("useWebSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    lastWsInstance = null;
    globalThis.WebSocket = MockWebSocket as any;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts disconnected when no token", () => {
    const { result } = renderHook(() =>
      useWebSocket({ token: null, autoConnect: true })
    );
    expect(result.current.status).toBe("disconnected");
    expect(lastWsInstance).toBeNull();
  });

  it("auto-connects when token provided", () => {
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token", autoConnect: true })
    );
    expect(result.current.status).toBe("connecting");
    expect(lastWsInstance).not.toBeNull();
    expect(lastWsInstance.url).toContain("token=test-token");
  });

  it("sets status to connected on open", () => {
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token" })
    );
    act(() => {
      lastWsInstance.simulateOpen();
    });
    expect(result.current.status).toBe("connected");
  });

  it("dispatches messages to type-specific subscribers", () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token" })
    );

    act(() => {
      lastWsInstance.simulateOpen();
    });

    act(() => {
      result.current.subscribe("chat.message", handler);
    });

    act(() => {
      lastWsInstance.simulateMessage({ type: "chat.message", data: { text: "hello" } });
    });

    expect(handler).toHaveBeenCalledWith({ type: "chat.message", data: { text: "hello" } });
  });

  it("dispatches to wildcard subscribers", () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token" })
    );

    act(() => {
      lastWsInstance.simulateOpen();
    });

    act(() => {
      result.current.subscribe("*", handler);
    });

    act(() => {
      lastWsInstance.simulateMessage({ type: "some.event", data: {} });
    });

    expect(handler).toHaveBeenCalledWith({ type: "some.event", data: {} });
  });

  it("unsubscribe stops handler from receiving messages", () => {
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token" })
    );

    act(() => {
      lastWsInstance.simulateOpen();
    });

    let unsub: () => void;
    act(() => {
      unsub = result.current.subscribe("test.event", handler);
    });

    act(() => {
      unsub();
    });

    act(() => {
      lastWsInstance.simulateMessage({ type: "test.event", data: {} });
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("send() calls ws.send with JSON", () => {
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token" })
    );

    act(() => {
      lastWsInstance.simulateOpen();
    });

    act(() => {
      result.current.send({ type: "ping" });
    });

    expect(lastWsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: "ping" }));
  });

  it("disconnect() closes connection", () => {
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token" })
    );

    act(() => {
      lastWsInstance.simulateOpen();
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.status).toBe("disconnected");
  });

  it("sets status to error on WebSocket error", () => {
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token" })
    );

    act(() => {
      lastWsInstance.simulateError();
    });

    expect(result.current.status).toBe("error");
  });

  it("updates lastMessage on receiving message", () => {
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token" })
    );

    act(() => {
      lastWsInstance.simulateOpen();
    });

    act(() => {
      lastWsInstance.simulateMessage({ type: "test", payload: 123 });
    });

    expect(result.current.lastMessage).toEqual({ type: "test", payload: 123 });
  });

  it("does not auto-connect when autoConnect=false", () => {
    renderHook(() =>
      useWebSocket({ token: "test-token", autoConnect: false })
    );
    expect(lastWsInstance).toBeNull();
  });

  it("manual connect works when autoConnect=false", () => {
    const { result } = renderHook(() =>
      useWebSocket({ token: "test-token", autoConnect: false })
    );

    act(() => {
      result.current.connect();
    });

    expect(lastWsInstance).not.toBeNull();
  });
});
