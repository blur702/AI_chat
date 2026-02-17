import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatModeSelector } from "@/components/chat-mode-selector";

vi.mock("@workstation/ui", () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <div role="tooltip">{children}</div>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  Bot: ({ className }: any) => <span data-testid="icon-bot" className={className} />,
  Code: ({ className }: any) => <span data-testid="icon-code" className={className} />,
  Map: ({ className }: any) => <span data-testid="icon-map" className={className} />,
  HelpCircle: ({ className }: any) => <span data-testid="icon-help" className={className} />,
  MessageCircle: ({ className }: any) => <span data-testid="icon-message" className={className} />,
}));

vi.mock("@workstation/api/hooks", () => ({
  CHAT_MODES: [
    { key: "agent", label: "Full Agent", icon: "Bot", description: "Autonomous code actions" },
    { key: "suggest", label: "Suggestions", icon: "Code", description: "Code in markdown blocks" },
    { key: "plan", label: "Plan", icon: "Map", description: "Create plans" },
    { key: "ask", label: "Ask", icon: "HelpCircle", description: "Q&A" },
    { key: "chat", label: "Chat", icon: "MessageCircle", description: "Natural conversation" },
  ],
}));

describe("ChatModeSelector", () => {
  let onModeChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onModeChange = vi.fn();
  });

  it("renders all mode buttons", () => {
    render(<ChatModeSelector activeMode="agent" onModeChange={onModeChange} />);
    expect(screen.getByLabelText(/Full Agent mode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Suggestions mode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Plan mode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ask mode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Chat mode/)).toBeInTheDocument();
  });

  it("marks active mode with aria-pressed=true", () => {
    render(<ChatModeSelector activeMode="plan" onModeChange={onModeChange} />);
    const planBtn = screen.getByLabelText(/Plan mode/);
    expect(planBtn).toHaveAttribute("aria-pressed", "true");
    const agentBtn = screen.getByLabelText(/Full Agent mode/);
    expect(agentBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onModeChange when a mode button is clicked", () => {
    render(<ChatModeSelector activeMode="agent" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByLabelText(/Suggestions mode/));
    expect(onModeChange).toHaveBeenCalledWith("suggest");
  });

  it("disables buttons when disabled=true", () => {
    render(<ChatModeSelector activeMode="agent" onModeChange={onModeChange} disabled />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("does not call onModeChange when disabled", () => {
    render(<ChatModeSelector activeMode="agent" onModeChange={onModeChange} disabled />);
    fireEvent.click(screen.getByLabelText(/Suggestions mode/));
    expect(onModeChange).not.toHaveBeenCalled();
  });
});
