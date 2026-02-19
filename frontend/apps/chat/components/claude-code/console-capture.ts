/**
 * Captures browser console errors and warnings, filtering out noise
 * from framework internals, browser extensions, and development tooling.
 */

export interface CapturedLog {
  level: "error" | "warn";
  message: string;
  timestamp: number;
}

// Patterns to filter out — framework noise, extensions, dev tooling
const NOISE_PATTERNS = [
  // React dev-mode warnings
  /Warning: .* did not match/,
  /Warning: Each child in a list should have a unique "key" prop/,
  /Warning: Can't perform a React state update on an unmounted component/,
  /Warning: componentWillMount has been renamed/,
  /Warning: componentWillReceiveProps has been renamed/,
  /Warning: findDOMNode is deprecated/,
  // Next.js dev noise
  /Fast Refresh/i,
  /\[HMR\]/,
  /\[next\]/i,
  /hydration/i,
  // Browser extensions
  /chrome-extension:\/\//,
  /moz-extension:\/\//,
  /extension:\/\//,
  // Common third-party noise
  /ResizeObserver loop/,
  /Non-Error promise rejection captured/,
  /Loading chunk \d+ failed/,
  // Source map warnings
  /DevTools failed to load source map/,
  /Could not load content for/,
  // CORS preflight noise (not actual errors)
  /Access to .* has been blocked by CORS policy.*preflight/,
  // Favicon
  /favicon\.ico/,
  // Webpack dev server
  /\[webpack-dev-server\]/,
];

function isNoise(message: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(message));
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

let logs: CapturedLog[] = [];
let installed = false;
let originalError: typeof console.error | null = null;
let originalWarn: typeof console.warn | null = null;

const MAX_LOGS = 200;

export function installConsoleCapture(): void {
  if (installed) return;
  installed = true;

  originalError = console.error;
  originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    const message = formatArgs(args);
    if (!isNoise(message)) {
      logs.push({ level: "error", message, timestamp: Date.now() });
      if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    }
    originalError!.apply(console, args);
  };

  console.warn = (...args: unknown[]) => {
    const message = formatArgs(args);
    if (!isNoise(message)) {
      logs.push({ level: "warn", message, timestamp: Date.now() });
      if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    }
    originalWarn!.apply(console, args);
  };

  // Also capture unhandled errors
  window.addEventListener("error", (event) => {
    const message = `Unhandled Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
    if (!isNoise(message)) {
      logs.push({ level: "error", message, timestamp: Date.now() });
      if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    }
  });

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = `Unhandled Promise Rejection: ${reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)}`;
    if (!isNoise(message)) {
      logs.push({ level: "error", message, timestamp: Date.now() });
      if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    }
  });
}

export function getCapturedLogs(): CapturedLog[] {
  return [...logs];
}

export function clearCapturedLogs(): void {
  logs = [];
}

export function formatLogsForClipboard(entries: CapturedLog[]): string {
  if (entries.length === 0) return "(no console errors or warnings captured)";
  return entries
    .map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      return `[${time}] [${entry.level.toUpperCase()}] ${entry.message}`;
    })
    .join("\n");
}
