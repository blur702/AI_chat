"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuth, getClient } from "@workstation/api";
import { formatArgs } from "../claude-code/console-capture";

const MAX_ISSUES_PER_SESSION = 20;
const BATCH_DELAY_MS = 2000;

interface QueuedError {
  level: "error" | "warn";
  message: string;
  timestamp: number;
}

export function ConsoleBugReporterProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  const reportingRef = useRef(false);
  const countRef = useRef(0);
  const queueRef = useRef<QueuedError[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preAuthQueueRef = useRef<QueuedError[]>([]);

  const flush = useCallback(async () => {
    timerRef.current = null;
    const batch = queueRef.current.splice(0);
    if (batch.length === 0) return;

    reportingRef.current = true;
    const client = getClient();

    const remaining = MAX_ISSUES_PER_SESSION - countRef.current;
    const promises = batch.slice(0, Math.max(0, remaining)).map((entry) => {
      countRef.current++;
      const titleMsg = entry.message.slice(0, 120);
      return client
        .createIssue({
          title: `[Auto] ${entry.level}: ${titleMsg}`,
          description: [
            `**Level:** ${entry.level}`,
            `**URL:** ${typeof window !== "undefined" ? window.location.href : ""}`,
            `**Time:** ${new Date(entry.timestamp).toISOString()}`,
            `**User-Agent:** ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
            "",
            "```",
            entry.message,
            "```",
          ].join("\n"),
          severity: entry.level === "error" ? "medium" : "low",
          is_app_issue: true,
        })
        .catch(() => {
          // Silently swallow — avoid recursion
        });
    });

    await Promise.allSettled(promises);
    reportingRef.current = false;
  }, []);

  // Capture errors before authentication so they can be replayed after login
  useEffect(() => {
    if (isAuthenticated) return;

    const prevError = console.error;
    const prevWarn = console.warn;

    function enqueuePreAuth(level: "error" | "warn", args: unknown[]) {
      if (preAuthQueueRef.current.length >= MAX_ISSUES_PER_SESSION) return;
      preAuthQueueRef.current.push({ level, message: formatArgs(args), timestamp: Date.now() });
    }

    console.error = (...args: unknown[]) => {
      prevError.apply(console, args);
      enqueuePreAuth("error", args);
    };

    console.warn = (...args: unknown[]) => {
      prevWarn.apply(console, args);
      enqueuePreAuth("warn", args);
    };

    return () => {
      console.error = prevError;
      console.warn = prevWarn;
    };
  }, [isAuthenticated]);

  // Direct console intercept — no noise filtering, captures everything
  useEffect(() => {
    if (!isAuthenticated) return;

    const prevError = console.error;
    const prevWarn = console.warn;

    function enqueue(level: "error" | "warn", args: unknown[]) {
      if (reportingRef.current) return;
      if (countRef.current >= MAX_ISSUES_PER_SESSION) return;

      const message = formatArgs(args);

      queueRef.current.push({ level, message, timestamp: Date.now() });
      if (!timerRef.current) {
        timerRef.current = setTimeout(flush, BATCH_DELAY_MS);
      }
    }

    console.error = (...args: unknown[]) => {
      prevError.apply(console, args);
      enqueue("error", args);
    };

    console.warn = (...args: unknown[]) => {
      prevWarn.apply(console, args);
      enqueue("warn", args);
    };

    const onError = (event: ErrorEvent) => {
      enqueue("error", [
        `Unhandled Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      ]);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      enqueue("error", [
        `Unhandled Promise Rejection: ${reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)}`,
      ]);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // Flush pre-auth queue
    const pending = preAuthQueueRef.current.splice(0);
    if (pending.length > 0) {
      queueRef.current.push(...pending);
      if (!timerRef.current) {
        timerRef.current = setTimeout(flush, BATCH_DELAY_MS);
      }
    }

    return () => {
      console.error = prevError;
      console.warn = prevWarn;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Fire-and-forget flush of remaining queued items
      const remaining = queueRef.current.splice(0);
      if (remaining.length > 0) {
        const client = getClient();
        for (const entry of remaining) {
          if (countRef.current >= MAX_ISSUES_PER_SESSION) break;
          countRef.current++;
          const titleMsg = entry.message.slice(0, 120);
          client
            .createIssue({
              title: `[Auto] ${entry.level}: ${titleMsg}`,
              description: [
                `**Level:** ${entry.level}`,
                `**URL:** ${typeof window !== "undefined" ? window.location.href : ""}`,
                `**Time:** ${new Date(entry.timestamp).toISOString()}`,
                "",
                "```",
                entry.message,
                "```",
              ].join("\n"),
              severity: entry.level === "error" ? "medium" : "low",
              is_app_issue: true,
            })
            .catch(() => {});
        }
      }
    };
  }, [isAuthenticated, flush]);

  return <>{children}</>;
}
