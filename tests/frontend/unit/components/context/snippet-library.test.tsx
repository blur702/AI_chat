import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { workstationUiMock } from "../../test-utils";

const mockSnippets = [
  {
    id: "s1",
    name: "Setup Instructions",
    content: "Install dependencies with npm install",
    description: "How to set up the project",
    tags: ["setup", "npm"],
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "s2",
    name: "Docker Config",
    content: "docker-compose up -d",
    description: null,
    tags: [],
    created_at: "2025-01-02T00:00:00Z",
  },
];

const mockCreateSnippet = vi.fn().mockResolvedValue({ id: "s3" });
const mockUpdateSnippet = vi.fn().mockResolvedValue({ id: "s1" });
const mockDeleteSnippet = vi.fn().mockResolvedValue(true);

vi.mock("@workstation/ui", () => ({
  ...workstationUiMock,
  DialogClose: ({ children }: any) => <>{children}</>,
}));

vi.mock("@workstation/api", () => ({
  useSnippets: () => ({
    snippets: mockSnippets,
    loading: false,
    error: null,
    createSnippet: mockCreateSnippet,
    updateSnippet: mockUpdateSnippet,
    deleteSnippet: mockDeleteSnippet,
  }),
}));

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => ({ children, ...props }: any) => <span data-icon={name} {...props}>{children}</span>,
}));

import { SnippetLibrary } from "@/components/context/snippet-library";

describe("SnippetLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading", () => {
    render(<SnippetLibrary />);
    expect(screen.getByText("Context Snippets")).toBeInTheDocument();
  });

  it("renders snippet list", () => {
    render(<SnippetLibrary />);
    expect(screen.getByText("Setup Instructions")).toBeInTheDocument();
    expect(screen.getByText("Docker Config")).toBeInTheDocument();
  });

  it("shows snippet description", () => {
    render(<SnippetLibrary />);
    expect(screen.getByText("How to set up the project")).toBeInTheDocument();
  });

  it("shows snippet tags", () => {
    render(<SnippetLibrary />);
    expect(screen.getByText("setup")).toBeInTheDocument();
    expect(screen.getByText("npm")).toBeInTheDocument();
  });

  it("has edit buttons for each snippet", () => {
    render(<SnippetLibrary />);
    const editButtons = screen.getAllByLabelText(/^Edit /);
    expect(editButtons.length).toBe(2);
  });

  it("has delete buttons for each snippet", () => {
    render(<SnippetLibrary />);
    const deleteButtons = screen.getAllByLabelText(/^Delete /);
    expect(deleteButtons.length).toBe(2);
  });

  it("has new snippet button", () => {
    render(<SnippetLibrary />);
    expect(screen.getByText("New Snippet")).toBeInTheDocument();
  });

  it("opens create dialog on new snippet click", () => {
    render(<SnippetLibrary />);
    fireEvent.click(screen.getByText("New Snippet"));
    expect(screen.getByText("New Snippet", { selector: "h2" })).toBeInTheDocument();
  });

  it("opens edit dialog when edit clicked", () => {
    render(<SnippetLibrary />);
    const editButtons = screen.getAllByLabelText(/^Edit /);
    fireEvent.click(editButtons[0]);
    expect(screen.getByText("Edit Snippet")).toBeInTheDocument();
  });
});
