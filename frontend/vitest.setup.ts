import "@testing-library/jest-dom/vitest";

// --- Global browser API mocks ---

// IntersectionObserver (used by scroll behaviors, lazy loading)
class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(private callback: IntersectionObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
globalThis.IntersectionObserver = MockIntersectionObserver as any;

// ResizeObserver (required by react-resizable-panels in IDE layout)
class MockResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as any;

// WebSocket (used by use-websocket.ts)
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
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  send(_data: string | ArrayBuffer | Blob) {}
  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}
globalThis.WebSocket = MockWebSocket as any;

// navigator.clipboard (used by code-block copy)
Object.defineProperty(globalThis.navigator, "clipboard", {
  value: {
    writeText: async (_text: string) => {},
    readText: async () => "",
  },
  writable: true,
  configurable: true,
});

// matchMedia (used by prefers-reduced-motion, responsive hooks)
if (typeof globalThis.matchMedia === "undefined") {
  globalThis.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Element.scrollIntoView (not implemented in jsdom)
Element.prototype.scrollIntoView = function () {};

// crypto.randomUUID (used by toast-provider)
if (!globalThis.crypto?.randomUUID) {
  const crypto = globalThis.crypto || {};
  let counter = 0;
  crypto.randomUUID = () =>
    `test-uuid-${++counter}` as `${string}-${string}-${string}-${string}-${string}`;
  globalThis.crypto = crypto as Crypto;
}
