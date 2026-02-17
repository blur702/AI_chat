import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockServiceStatus = {
  backendReachable: true,
  criticalServicesReady: true,
  allServicesReady: true,
  services: [] as any[],
  unreachableDuration: 0,
};

vi.mock("@workstation/api/hooks", () => ({
  useServiceStatus: () => mockServiceStatus,
}));

vi.mock("@workstation/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

import { ServiceStatusBanner } from "@/components/service-status-banner";

describe("ServiceStatusBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockServiceStatus, {
      backendReachable: true,
      criticalServicesReady: true,
      allServicesReady: true,
      services: [],
      unreachableDuration: 0,
    });
  });

  it("shows 'All services ready' when all healthy", () => {
    render(<ServiceStatusBanner />);
    expect(screen.getByText("All services ready")).toBeInTheDocument();
  });

  it("shows 'Waiting for backend...' when backend unreachable", () => {
    Object.assign(mockServiceStatus, {
      backendReachable: false,
      criticalServicesReady: false,
      allServicesReady: false,
      unreachableDuration: 5,
    });
    render(<ServiceStatusBanner />);
    expect(screen.getByText("Waiting for backend...")).toBeInTheDocument();
  });

  it("shows extended failure warning after 60s unreachable", () => {
    Object.assign(mockServiceStatus, {
      backendReachable: false,
      criticalServicesReady: false,
      allServicesReady: false,
      unreachableDuration: 65,
    });
    render(<ServiceStatusBanner />);
    expect(screen.getByText(/Backend unreachable \(65s\)/)).toBeInTheDocument();
  });

  it("shows per-service indicators when backend reachable but critical not ready", () => {
    Object.assign(mockServiceStatus, {
      backendReachable: true,
      criticalServicesReady: false,
      allServicesReady: false,
      services: [
        { name: "ollama_client", label: "Ollama", detail: { healthy: false, is_running: true } },
        { name: "comfyui_client", label: "ComfyUI", detail: { healthy: true, is_running: true } },
      ],
    });
    render(<ServiceStatusBanner />);
    expect(screen.getByText("Services starting:")).toBeInTheDocument();
    expect(screen.getByText("Ollama")).toBeInTheDocument();
    expect(screen.getByText("ComfyUI")).toBeInTheDocument();
  });

  it("shows 'Ready' when critical ready but not all", () => {
    Object.assign(mockServiceStatus, {
      backendReachable: true,
      criticalServicesReady: true,
      allServicesReady: false,
    });
    render(<ServiceStatusBanner />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});
