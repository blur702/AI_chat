import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { workstationUiMock } from "../../test-utils";

vi.mock("@workstation/ui", () => workstationUiMock);

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => {
    if (name === "__esModule") return true;
    return ({ children, ...props }: any) => <span data-icon={String(name)} {...props}>{children}</span>;
  },
}));

vi.mock("@/components/admin/service-debug-modal", () => ({
  ServiceDebugModal: ({ open }: any) => open ? <div data-testid="debug-modal">Debug Modal</div> : null,
}));

import { ServiceHealth } from "@/components/admin/service-health";

const sampleDebugInfo = {
  services: {
    ollama: {
      service_name: "ollama",
      health_status: true,
      health_message: "Connected",
      is_running: true,
    },
    comfyui: {
      service_name: "comfyui",
      health_status: false,
      health_message: "Unreachable",
      is_running: false,
    },
  },
};

describe("ServiceHealth", () => {
  const mockGetServiceDebug = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServiceDebug.mockResolvedValue({
      service_name: "ollama",
      health_status: true,
      health_message: "Connected",
      is_running: true,
    });
  });

  it("shows skeleton when debugInfo is null", () => {
    const { container } = render(
      <ServiceHealth debugInfo={null} getServiceDebug={mockGetServiceDebug} />
    );
    expect(container.querySelectorAll("[data-testid='skeleton']").length).toBeGreaterThan(0);
  });

  it("renders heading", () => {
    render(
      <ServiceHealth debugInfo={sampleDebugInfo} getServiceDebug={mockGetServiceDebug} />
    );
    expect(screen.getByText("Service Health")).toBeInTheDocument();
  });

  it("renders service names", () => {
    render(
      <ServiceHealth debugInfo={sampleDebugInfo} getServiceDebug={mockGetServiceDebug} />
    );
    expect(screen.getByText("ollama")).toBeInTheDocument();
    expect(screen.getByText("comfyui")).toBeInTheDocument();
  });

  it("shows health messages", () => {
    render(
      <ServiceHealth debugInfo={sampleDebugInfo} getServiceDebug={mockGetServiceDebug} />
    );
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Unreachable")).toBeInTheDocument();
  });

  it("shows running/stopped badges", () => {
    render(
      <ServiceHealth debugInfo={sampleDebugInfo} getServiceDebug={mockGetServiceDebug} />
    );
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });

  it("has debug buttons", () => {
    render(
      <ServiceHealth debugInfo={sampleDebugInfo} getServiceDebug={mockGetServiceDebug} />
    );
    const debugButtons = screen.getAllByText("Debug");
    expect(debugButtons.length).toBe(2);
  });

  it("opens debug modal on click", async () => {
    render(
      <ServiceHealth debugInfo={sampleDebugInfo} getServiceDebug={mockGetServiceDebug} />
    );
    const debugButtons = screen.getAllByText("Debug");
    fireEvent.click(debugButtons[0]);

    await waitFor(() => {
      expect(mockGetServiceDebug).toHaveBeenCalledWith("ollama");
    });

    await waitFor(() => {
      expect(screen.getByTestId("debug-modal")).toBeInTheDocument();
    });
  });

  it("shows empty state when no services", () => {
    render(
      <ServiceHealth debugInfo={{ services: {} }} getServiceDebug={mockGetServiceDebug} />
    );
    expect(screen.getByText("No services registered.")).toBeInTheDocument();
  });
});
