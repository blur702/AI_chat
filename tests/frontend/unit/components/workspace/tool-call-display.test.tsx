import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@workstation/ui", () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

import { ToolCallDisplay } from "@/components/workspace/tools/tool-call-display";

const baseTc = {
  call_id: "tc1",
  tool_name: "web_search",
  arguments: { query: "test" },
  status: "success" as const,
  result_preview: "Found 3 results",
  duration_ms: 150,
};

describe("ToolCallDisplay", () => {
  const onApprove = vi.fn();
  const onDeny = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no tool calls", () => {
    const { container } = render(
      <ToolCallDisplay toolCalls={[]} pendingApproval={null} onApprove={onApprove} onDeny={onDeny} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders tool call with name", () => {
    render(
      <ToolCallDisplay
        toolCalls={[baseTc]}
        pendingApproval={null}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
    expect(screen.getByText("web_search")).toBeInTheDocument();
  });

  it("shows status label", () => {
    render(
      <ToolCallDisplay
        toolCalls={[baseTc]}
        pendingApproval={null}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("shows duration when available", () => {
    render(
      <ToolCallDisplay
        toolCalls={[baseTc]}
        pendingApproval={null}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
    expect(screen.getByText("150ms")).toBeInTheDocument();
  });

  it("shows result preview for completed calls", () => {
    render(
      <ToolCallDisplay
        toolCalls={[baseTc]}
        pendingApproval={null}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
    expect(screen.getByText("Found 3 results")).toBeInTheDocument();
  });

  it("shows arguments for non-terminal statuses", () => {
    const executing = { ...baseTc, status: "executing" as any, result_preview: undefined };
    render(
      <ToolCallDisplay
        toolCalls={[executing]}
        pendingApproval={null}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
    expect(screen.getByText("Executing...")).toBeInTheDocument();
  });

  it("shows approve/deny buttons for pending approval", () => {
    const pending = { ...baseTc, call_id: "tc-pending", status: "pending_approval" as any };
    const approval = { call_id: "tc-pending", tool_name: "web_search", arguments: {} };
    render(
      <ToolCallDisplay
        toolCalls={[pending]}
        pendingApproval={approval as any}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });

  it("calls onApprove when approve clicked", () => {
    const pending = { ...baseTc, call_id: "tc2", status: "pending_approval" as any };
    const approval = { call_id: "tc2", tool_name: "web_search", arguments: {} };
    render(
      <ToolCallDisplay
        toolCalls={[pending]}
        pendingApproval={approval as any}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
    fireEvent.click(screen.getByText("Approve"));
    expect(onApprove).toHaveBeenCalledWith("tc2");
  });

  it("calls onDeny when deny clicked", () => {
    const pending = { ...baseTc, call_id: "tc3", status: "pending_approval" as any };
    const approval = { call_id: "tc3", tool_name: "web_search", arguments: {} };
    render(
      <ToolCallDisplay
        toolCalls={[pending]}
        pendingApproval={approval as any}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
    fireEvent.click(screen.getByText("Deny"));
    expect(onDeny).toHaveBeenCalledWith("tc3");
  });

  it("renders multiple tool calls", () => {
    const calls = [
      baseTc,
      { ...baseTc, call_id: "tc2", tool_name: "code_read", status: "executing" as any },
    ];
    render(
      <ToolCallDisplay
        toolCalls={calls}
        pendingApproval={null}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
    expect(screen.getByText("web_search")).toBeInTheDocument();
    expect(screen.getByText("code_read")).toBeInTheDocument();
  });
});
