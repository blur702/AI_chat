import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { workstationUiMock } from "../../test-utils";

vi.mock("@workstation/ui", () => workstationUiMock);

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => {
    if (name === "__esModule") return true;
    return ({ children, ...props }: any) => <span data-icon={String(name)} {...props}>{children}</span>;
  },
}));

import { QuickStats } from "@/components/admin/quick-stats";

const sampleMetrics = {
  uptime_seconds: 7265,
  healthy_service_count: 5,
  registered_service_count: 6,
  total_registered_tools: 12,
  active_conversations: 3,
  active_queue_processors: 2,
  redis_memory_bytes: 2048576,
};

describe("QuickStats", () => {
  it("shows loading skeleton when metrics is null", () => {
    const { container } = render(<QuickStats metrics={null} />);
    const pulseItems = container.querySelectorAll(".animate-pulse");
    expect(pulseItems.length).toBe(6);
  });

  it("renders uptime", () => {
    render(<QuickStats metrics={sampleMetrics} />);
    expect(screen.getByText("Uptime")).toBeInTheDocument();
    expect(screen.getByText("2h 1m")).toBeInTheDocument();
  });

  it("renders service count", () => {
    render(<QuickStats metrics={sampleMetrics} />);
    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("5/6")).toBeInTheDocument();
  });

  it("renders tools count", () => {
    render(<QuickStats metrics={sampleMetrics} />);
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders conversations count", () => {
    render(<QuickStats metrics={sampleMetrics} />);
    expect(screen.getByText("Conversations")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders redis memory", () => {
    render(<QuickStats metrics={sampleMetrics} />);
    expect(screen.getByText("Redis Memory")).toBeInTheDocument();
    expect(screen.getByText("2.0 MB")).toBeInTheDocument();
  });

  it("renders queue processors", () => {
    render(<QuickStats metrics={sampleMetrics} />);
    expect(screen.getByText("Queue Processors")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
