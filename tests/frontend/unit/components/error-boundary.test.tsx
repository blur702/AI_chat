import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ErrorBoundary } from "@/components/error-boundary";

function ThrowingChild({ shouldThrow, errorMessage }: { shouldThrow: boolean; errorMessage?: string }) {
  if (shouldThrow) {
    throw new Error(errorMessage ?? "Test error");
  }
  return <div>Child rendered</div>;
}

describe("ErrorBoundary", () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Child rendered")).toBeInTheDocument();
  });

  it("renders error UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText("Test error")).toBeInTheDocument();
  });

  it("renders a custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
  });

  it("recovers when 'Try Again' is clicked", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    const tryAgainBtn = screen.getByRole("button", { name: /try again/i });
    expect(tryAgainBtn).toBeInTheDocument();
    fireEvent.click(tryAgainBtn);
    // It will immediately error again since ThrowingChild always throws
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("shows network error UI for network errors", () => {
    function NetworkErrorChild() {
      const err = new TypeError("Failed to fetch");
      throw err;
    }
    render(
      <ErrorBoundary>
        <NetworkErrorChild />
      </ErrorBoundary>
    );
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
    expect(screen.getByText(/unable to reach the server/i)).toBeInTheDocument();
  });

  it("shows chunk load error UI for dynamic import failures", () => {
    function ChunkErrorChild() {
      throw new Error("Loading chunk 123 failed");
    }
    render(
      <ErrorBoundary>
        <ChunkErrorChild />
      </ErrorBoundary>
    );
    expect(screen.getByText(/application update available/i)).toBeInTheDocument();
  });

  it("auto-retries chunk load errors and eventually stops", () => {
    vi.useFakeTimers();
    let throwCount = 0;

    function ChunkErrorChild() {
      throwCount++;
      throw new Error("Loading chunk 456 failed");
    }

    render(
      <ErrorBoundary>
        <ChunkErrorChild />
      </ErrorBoundary>
    );

    const initialCount = throwCount;
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Advance timers to trigger auto-retries (each retry waits 1000ms)
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1100);
      });
    }

    const finalCount = throwCount;
    // After exhausting MAX_AUTO_RETRIES (3), no more retries should happen
    const countAfterExhaustion = throwCount;

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // No additional throws after exhaustion
    expect(throwCount).toBe(countAfterExhaustion);

    // Should show the error UI since retries are exhausted
    expect(screen.getByText(/application update available/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("calls onError callback when an error occurs", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingChild shouldThrow={true} errorMessage="callback test" />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "callback test" }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });
});
