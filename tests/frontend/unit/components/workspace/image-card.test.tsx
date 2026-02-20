import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { workstationUiMock } from "../../test-utils";

vi.mock("@workstation/ui", () => workstationUiMock);

vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: any) => <img src={src} alt={alt} />,
}));

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => ({ children, ...props }: any) => <span data-icon={name} {...props}>{children}</span>,
}));

import { ImageCard } from "@/components/workspace/image-gen/image-card";

const completedGen = {
  id: "gen1",
  prompt: "A red cat",
  status: "completed" as const,
  result_images: ["/images/cat.png"],
  workflow_type: "txt2img",
  created_at: "2025-01-01T00:00:00Z",
  is_favorite: false,
  error_message: null,
  project_id: "proj1",
  seed: 42,
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7,
  checkpoint: "test",
};

describe("ImageCard", () => {
  const onView = vi.fn();
  const onDelete = vi.fn();
  const onDownload = vi.fn();
  const onToggleFavorite = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders prompt text", () => {
    render(<ImageCard generation={completedGen} onView={onView} onDelete={onDelete} />);
    expect(screen.getByText("A red cat")).toBeInTheDocument();
  });

  it("shows completed status badge", () => {
    render(<ImageCard generation={completedGen} onView={onView} onDelete={onDelete} />);
    // Status label appears in badge and bottom section
    expect(screen.getAllByText("Completed").length).toBeGreaterThanOrEqual(1);
  });

  it("shows workflow type", () => {
    render(<ImageCard generation={completedGen} onView={onView} onDelete={onDelete} />);
    expect(screen.getByText("txt2img")).toBeInTheDocument();
  });

  it("renders image for completed generation", () => {
    render(<ImageCard generation={completedGen} onView={onView} onDelete={onDelete} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/images/cat.png");
  });

  it("shows loading indicator for pending", () => {
    const pending = { ...completedGen, status: "pending" as const, result_images: [] };
    render(<ImageCard generation={pending} onView={onView} onDelete={onDelete} />);
    expect(screen.getByText("Generating...")).toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
  });

  it("shows error state for failed", () => {
    const failed = {
      ...completedGen,
      status: "failed" as const,
      result_images: [],
      error_message: "Out of memory",
    };
    render(<ImageCard generation={failed} onView={onView} onDelete={onDelete} />);
    expect(screen.getByText("Out of memory")).toBeInTheDocument();
    // "Failed" appears in both the badge and the bottom status
    expect(screen.getAllByText("Failed").length).toBeGreaterThanOrEqual(1);
  });

  it("shows checkbox in bulk mode", () => {
    render(
      <ImageCard
        generation={completedGen}
        onView={onView}
        onDelete={onDelete}
        bulkMode
        selected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("checkbox reflects selected state", () => {
    render(
      <ImageCard
        generation={completedGen}
        onView={onView}
        onDelete={onDelete}
        bulkMode
        selected
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
