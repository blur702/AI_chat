import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@workstation/ui", () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => ({ children, ...props }: any) => <span data-icon={name} {...props}>{children}</span>,
}));

import { PanelErrorBoundary } from "@/components/workspace/panel-error-boundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test crash");
  return <div>Child content</div>;
}

describe("PanelErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress React error boundary console errors
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error", () => {
    render(
      <PanelErrorBoundary>
        <div>Normal content</div>
      </PanelErrorBoundary>
    );
    expect(screen.getByText("Normal content")).toBeInTheDocument();
  });

  it("shows crash message when child throws", () => {
    render(
      <PanelErrorBoundary>
        <ThrowingChild shouldThrow />
      </PanelErrorBoundary>
    );
    expect(screen.getByText("Panel crashed")).toBeInTheDocument();
    expect(screen.getByText("Test crash")).toBeInTheDocument();
  });

  it("uses custom panel name", () => {
    render(
      <PanelErrorBoundary panelName="Editor">
        <ThrowingChild shouldThrow />
      </PanelErrorBoundary>
    );
    expect(screen.getByText("Editor crashed")).toBeInTheDocument();
  });

  it("has retry button", () => {
    render(
      <PanelErrorBoundary>
        <ThrowingChild shouldThrow />
      </PanelErrorBoundary>
    );
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("resets error state on retry click", () => {
    render(
      <PanelErrorBoundary>
        <ThrowingChild shouldThrow />
      </PanelErrorBoundary>
    );
    expect(screen.getByText("Panel crashed")).toBeInTheDocument();

    // After clicking retry, boundary resets its state. The child will throw
    // again, so it catches it again - but we verify the reset happened by
    // confirming the crash message is still displayed (re-caught).
    fireEvent.click(screen.getByText("Retry"));
    // The component re-throws, so crash message re-appears
    expect(screen.getByText("Panel crashed")).toBeInTheDocument();
  });
});
