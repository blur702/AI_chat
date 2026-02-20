import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThinkingIndicator } from "@/components/thinking-indicator";

vi.mock("@workstation/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  Bot: ({ className }: any) => <span data-testid="bot-icon" className={className} />,
}));

describe("ThinkingIndicator", () => {
  it("renders with role='status'", () => {
    render(<ThinkingIndicator progress={50} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-label with progress percentage", () => {
    render(<ThinkingIndicator progress={75} />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Processing 75%"
    );
  });

  it("displays 'Thinking' text", () => {
    render(<ThinkingIndicator progress={0} />);
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("displays progress percentage", () => {
    render(<ThinkingIndicator progress={42} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("renders progress bar with correct width", () => {
    const { container } = render(<ThinkingIndicator progress={60} />);
    const bar = container.querySelector("[style]");
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute("style")).toContain("width: 60%");
  });

  it("shows 0% progress", () => {
    render(<ThinkingIndicator progress={0} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("shows 100% progress", () => {
    render(<ThinkingIndicator progress={100} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
