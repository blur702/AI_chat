import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { workstationUiMock } from "../../test-utils";
import { dndRef } from "../../mocks/dnd-kit-core";

/* ------------------------------------------------------------------ */
/*  Hoisted shared state                                               */
/* ------------------------------------------------------------------ */

const { mockFns } = vi.hoisted(() => ({
  mockFns: {
    loadModel: vi.fn().mockResolvedValue(true),
    unloadModel: vi.fn().mockResolvedValue(true),
    offloadToRam: vi.fn().mockResolvedValue({ success: true }),
    reloadFromRam: vi.fn().mockResolvedValue({ success: true }),
    refresh: vi.fn().mockResolvedValue(undefined),
  },
}));

let mockHookReturn: any;

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock("@workstation/ui", () => workstationUiMock);

vi.mock("lucide-react", async () => {
  const { createElement } = await import("react");
  const icon = (name: string) => (props: any) => createElement("span", { "data-icon": name, ...props });
  return {
    GripVertical: icon("GripVertical"),
    Cpu: icon("Cpu"),
    MemoryStick: icon("MemoryStick"),
    Trash2: icon("Trash2"),
    ArrowDownToLine: icon("ArrowDownToLine"),
    ArrowUpFromLine: icon("ArrowUpFromLine"),
    RefreshCcw: icon("RefreshCcw"),
    ChevronDown: icon("ChevronDown"),
    AlertCircle: icon("AlertCircle"),
    Zap: icon("Zap"),
    HelpCircle: icon("HelpCircle"),
  };
});

vi.mock("@workstation/api/hooks", () => ({
  useVramManagement: () => mockHookReturn,
  useAuth: () => ({ userId: "user-1" }),
}));

vi.mock("@/components/help/help-provider", () => ({
  useHelp: () => ({
    openHelp: vi.fn(),
    closeHelp: vi.fn(),
    isOpen: false,
    activeSection: null,
  }),
}));

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

import { VramManagement } from "@/components/admin/vram-management";

/* ------------------------------------------------------------------ */
/*  Test data factories                                                */
/* ------------------------------------------------------------------ */

function makeGpu(overrides: Partial<any> = {}) {
  return {
    gpu_index: 0,
    name: "RTX 4090",
    total_mb: 24576,
    used_mb: 8192,
    free_mb: 16384,
    utilization_percent: 33.33,
    ...overrides,
  };
}

function defaultHookReturn(overrides: Partial<any> = {}) {
  return {
    gpus: [makeGpu()],
    vramStats: { total_mb: 24576, used_mb: 8192, free_mb: 16384 },
    systemStats: { ram_used_mb: 16000, ram_total_mb: 64000 },
    runningModels: [{ name: "llama3.2", size_vram: 3_500_000_000 }],
    localModels: [{ name: "mistral", size: 7_000_000_000 }],
    offloadedResources: [],
    loadModel: mockFns.loadModel,
    unloadModel: mockFns.unloadModel,
    offloadToRam: mockFns.offloadToRam,
    reloadFromRam: mockFns.reloadFromRam,
    refresh: mockFns.refresh,
    actionLoading: null,
    loading: false,
    error: null,
    ...overrides,
  };
}

/**
 * Find the action button associated with a tooltip by text.
 * Our Tooltip mock renders children inline, so the TooltipContent (<div role="tooltip">)
 * sits right after the TooltipTrigger's Button. The button is previousElementSibling.
 */
function findButtonByTooltip(text: string): HTMLButtonElement {
  const tooltipDiv = screen.getByText(text);
  const sibling = tooltipDiv.previousElementSibling;
  if (sibling?.tagName === "BUTTON") return sibling as HTMLButtonElement;
  if (sibling) {
    const btn = sibling.querySelector("button");
    if (btn) return btn;
  }
  throw new Error(`Could not find button for tooltip "${text}"`);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("VramManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dndRef.onDragEnd = null;
    mockHookReturn = defaultHookReturn();
  });

  it("renders GPU card with name", () => {
    render(<VramManagement />);
    expect(screen.getByText("RTX 4090")).toBeInTheDocument();
  });

  it("renders VRAM progress bar", () => {
    render(<VramManagement />);
    const progressBar = screen.getAllByRole("progressbar")[0];
    expect(progressBar).toBeInTheDocument();
    const value = Number(progressBar.getAttribute("aria-valuenow"));
    expect(value).toBeGreaterThan(30);
    expect(value).toBeLessThan(36);
  });

  it("renders running model", () => {
    render(<VramManagement />);
    expect(screen.getByText("llama3.2")).toBeInTheDocument();
  });

  it("renders local model", () => {
    render(<VramManagement />);
    expect(screen.getByText("mistral")).toBeInTheDocument();
  });

  it("Unload button calls unloadModel", () => {
    render(<VramManagement />);
    const btn = findButtonByTooltip("Unload model");
    fireEvent.click(btn);
    expect(mockFns.unloadModel).toHaveBeenCalledWith("llama3.2");
  });

  it("Offload button calls offloadToRam", () => {
    render(<VramManagement />);
    const btn = findButtonByTooltip("Offload to RAM");
    fireEvent.click(btn);
    expect(mockFns.offloadToRam).toHaveBeenCalledWith("llama3.2", "user-1");
  });

  it("Load button calls loadModel", () => {
    render(<VramManagement />);
    const btn = findButtonByTooltip("Load model");
    fireEvent.click(btn);
    expect(mockFns.loadModel).toHaveBeenCalledWith("mistral");
  });

  it("Refresh button calls refresh", () => {
    render(<VramManagement />);
    const refreshBtn = screen.getByText("Refresh").closest("button");
    expect(refreshBtn).not.toBeNull();
    fireEvent.click(refreshBtn!);
    expect(mockFns.refresh).toHaveBeenCalled();
  });

  it("Error banner shown", () => {
    mockHookReturn = defaultHookReturn({ error: "VRAM error" });
    render(<VramManagement />);
    expect(screen.getByText("VRAM error")).toBeInTheDocument();
  });

  it("Skeleton when loading", () => {
    mockHookReturn = defaultHookReturn({ loading: true });
    const { container } = render(<VramManagement />);
    expect(
      container.querySelectorAll("[data-testid='skeleton']").length,
    ).toBeGreaterThan(0);
  });

  it("No GPUs detected", () => {
    mockHookReturn = defaultHookReturn({ gpus: [], runningModels: [] });
    render(<VramManagement />);
    expect(screen.getByText("No GPUs detected")).toBeInTheDocument();
  });

  it("RAM zone shows offloaded resources", () => {
    mockHookReturn = defaultHookReturn({
      offloadedResources: [
        { resource_id: "offloaded-llama", vram_mb: 4096 },
      ],
    });
    render(<VramManagement />);
    expect(screen.getByText("offloaded-llama")).toBeInTheDocument();
  });

  it("Reload button calls reloadFromRam", () => {
    mockHookReturn = defaultHookReturn({
      offloadedResources: [
        { resource_id: "offloaded-llama", vram_mb: 4096 },
      ],
    });
    render(<VramManagement />);
    const btn = findButtonByTooltip("Reload to GPU");
    fireEvent.click(btn);
    expect(mockFns.reloadFromRam).toHaveBeenCalledWith(
      "offloaded-llama",
      4096,
      "user-1",
    );
  });

  it("drag local model to GPU calls loadModel", () => {
    render(<VramManagement />);
    expect(dndRef.onDragEnd).toBeTypeOf("function");

    dndRef.onDragEnd!({
      active: { id: "mistral", data: { current: { type: "local" } } },
      over: { id: "gpu-0" },
    });

    expect(mockFns.loadModel).toHaveBeenCalledWith("mistral");
  });

  it("drag running model to RAM calls offloadToRam", () => {
    render(<VramManagement />);
    expect(dndRef.onDragEnd).toBeTypeOf("function");

    dndRef.onDragEnd!({
      active: { id: "llama3.2", data: { current: { type: "running" } } },
      over: { id: "ram" },
    });

    expect(mockFns.offloadToRam).toHaveBeenCalledWith("llama3.2", "user-1");
  });

  it("matches snapshot", () => {
    const { asFragment } = render(<VramManagement />);
    expect(asFragment()).toMatchSnapshot();
  });
});
