import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { workstationUiMock } from "../unit/test-utils";

// ---- Mocks ----

vi.mock("@workstation/ui", () => workstationUiMock);

vi.mock("lucide-react", () =>
  new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "__esModule") return true;
        return ({ children, ...props }: any) => (
          <span data-icon={String(name)} {...props}>
            {children}
          </span>
        );
      },
    }
  )
);

const mockModels = [
  {
    name: "llama3:8b",
    size: 4_500_000_000,
    description: "Meta's Llama 3 language model for general chat",
    details: { parameter_size: "8B", quantization_level: "Q4_0" },
  },
  {
    name: "codellama:7b",
    size: 3_800_000_000,
    description: "Code-focused model by Meta for code generation",
    details: { parameter_size: "7B", quantization_level: "Q4_0" },
  },
];

const mockRemoteModels = [
  {
    name: "mistral",
    description: "Mistral 7B model with reasoning capabilities",
    sizes: ["7b", "7b-instruct"],
  },
];

const mockLoadModel = vi.fn().mockResolvedValue(true);
const mockUnloadModel = vi.fn().mockResolvedValue(undefined);
const mockPullModel = vi.fn().mockResolvedValue(undefined);
const mockDeleteModel = vi.fn().mockResolvedValue(undefined);
const mockSetActiveModel = vi.fn();
const mockRefresh = vi.fn().mockResolvedValue(undefined);

vi.mock("@workstation/api/hooks", () => ({
  useModelSwitcher: () => ({
    models: mockModels,
    runningModels: [{ name: "llama3:8b", size_vram: 4_200_000_000 }],
    remoteModels: mockRemoteModels,
    activeModel: "llama3:8b",
    loading: false,
    actionLoading: null,
    pullProgress: null,
    error: null,
    setActiveModel: mockSetActiveModel,
    loadModel: mockLoadModel,
    unloadModel: mockUnloadModel,
    pullModel: mockPullModel,
    deleteModel: mockDeleteModel,
    refresh: mockRefresh,
    isModelRunning: (name: string) => name === "llama3:8b",
    getModelVramMb: (name: string) => (name === "llama3:8b" ? 4003 : null),
  }),
  useWebSocket: () => ({ subscribe: () => () => {} }),
  useAuth: () => ({ token: "test-token" }),
}));

import { ModelSelectorDialog } from "@/components/model-selector-dialog";

// ---- Tests ----

describe("Model Selector Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog with title and tabs", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Model Selector")).toBeInTheDocument();
    expect(screen.getByText(`Installed (${mockModels.length})`)).toBeInTheDocument();
    expect(screen.getByText(`Not Installed (${mockRemoteModels.length})`)).toBeInTheDocument();
    expect(screen.getByText("Cloud (3)")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<ModelSelectorDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Model Selector")).not.toBeInTheDocument();
  });

  it("shows current active model display", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("llama3")).toBeInTheDocument();
  });

  it("shows installed models with names", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("llama3:8b")).toBeInTheDocument();
    expect(screen.getByText("codellama:7b")).toBeInTheDocument();
  });

  it("shows Active badge for active model", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    // Active badge content includes Check icon + "Active" text
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows In VRAM badge for running models", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("In VRAM")).toBeInTheDocument();
  });

  it("shows model sizes formatted", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    // 4500000000 bytes ≈ 4.2 GB
    expect(screen.getByText("4.2 GB")).toBeInTheDocument();
    // 3800000000 bytes ≈ 3.5 GB
    expect(screen.getByText("3.5 GB")).toBeInTheDocument();
  });

  it("shows VRAM usage for running models", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("4003 MB VRAM")).toBeInTheDocument();
  });

  it("shows VRAM model count in footer", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("1 model loaded in VRAM")).toBeInTheDocument();
  });

  it("has Apply button", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Apply")).toBeInTheDocument();
  });

  it("shows details section on expand", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    const detailButtons = screen.getAllByText("Details & capabilities");
    fireEvent.click(detailButtons[0]);
    // After expanding, description should be visible
    expect(screen.getByText(/Meta's Llama 3/)).toBeInTheDocument();
  });

  it("shows derived capabilities", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    // Expand codellama details (second model)
    const detailButtons = screen.getAllByText("Details & capabilities");
    fireEvent.click(detailButtons[1]);
    expect(screen.getByText("Code generation")).toBeInTheDocument();
  });

  it("applies already-running model without re-loading", async () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);

    // Click Apply (llama3:8b is already selected as active and running)
    fireEvent.click(screen.getByText("Apply"));

    await waitFor(() => {
      // Since llama3:8b is already running, loadModel should NOT be called
      expect(mockSetActiveModel).toHaveBeenCalledWith("llama3:8b");
    });
    expect(mockLoadModel).not.toHaveBeenCalled();
  });

  it("switches to Not Installed tab", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    const notInstalledTab = screen.getByText(`Not Installed (${mockRemoteModels.length})`);
    fireEvent.click(notInstalledTab);
    // Remote models should be visible in the panel
    expect(screen.getByText("mistral")).toBeInTheDocument();
    expect(screen.getByText("Download required")).toBeInTheDocument();
  });

  it("shows size variants for remote models", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText(`Not Installed (${mockRemoteModels.length})`));
    expect(screen.getByText("7b")).toBeInTheDocument();
    expect(screen.getByText("7b-instruct")).toBeInTheDocument();
  });

  it("switches to Cloud tab and shows cloud models", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Cloud (3)"));
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("claude-3.7-sonnet")).toBeInTheDocument();
    expect(screen.getByText("gemini-2.0-flash")).toBeInTheDocument();
  });

  it("shows provider badges on cloud models", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Cloud (3)"));
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
  });

  it("refreshes models when dialog opens", () => {
    render(<ModelSelectorDialog open={true} onOpenChange={vi.fn()} />);
    expect(mockRefresh).toHaveBeenCalled();
  });
});
