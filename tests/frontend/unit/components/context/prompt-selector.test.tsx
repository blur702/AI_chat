import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockPrompts = [
  { id: "p1", name: "Default Prompt", is_default: true },
  { id: "p2", name: "Code Assistant", is_default: false },
];

vi.mock("@workstation/api", () => ({
  useSystemPrompts: () => ({
    prompts: mockPrompts,
    loading: false,
    error: null,
  }),
}));

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => ({ children, ...props }: any) => <span data-icon={name} {...props}>{children}</span>,
}));

import { PromptSelector } from "@/components/context/prompt-selector";

describe("PromptSelector", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders label", () => {
    render(<PromptSelector value={undefined} onChange={onChange} />);
    expect(screen.getByText("System Prompt")).toBeInTheDocument();
  });

  it("renders custom label", () => {
    render(<PromptSelector value={undefined} onChange={onChange} label="Custom Label" />);
    expect(screen.getByText("Custom Label")).toBeInTheDocument();
  });

  it("renders prompt options", () => {
    render(<PromptSelector value={undefined} onChange={onChange} />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    const options = select.querySelectorAll("option");
    // "None" + 2 prompts = 3
    expect(options.length).toBe(3);
  });

  it("shows default indicator", () => {
    render(<PromptSelector value={undefined} onChange={onChange} />);
    const select = screen.getByRole("combobox");
    const options = select.querySelectorAll("option");
    const defaultOption = Array.from(options).find((o) => o.textContent?.includes("(default)"));
    expect(defaultOption).toBeTruthy();
    expect(defaultOption?.textContent).toContain("Default Prompt");
  });

  it("calls onChange when selecting prompt", () => {
    render(<PromptSelector value={undefined} onChange={onChange} />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "p2" } });
    expect(onChange).toHaveBeenCalledWith("p2");
  });

  it("calls onChange with undefined when selecting none", () => {
    render(<PromptSelector value="p1" onChange={onChange} />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("sets value to selected prompt", () => {
    render(<PromptSelector value="p2" onChange={onChange} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("p2");
  });
});
