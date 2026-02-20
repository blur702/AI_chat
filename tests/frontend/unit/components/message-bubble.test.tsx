import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "@/components/message-bubble";

vi.mock("@workstation/ui", () => ({
  Button: ({ children, onClick, disabled, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children, side, className }: any) => (
    <div role="tooltip" className={className}>{children}</div>
  ),
  TooltipProvider: ({ children }: any) => <>{children}</>,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/code-block", () => ({
  CodeBlock: ({ code, language }: any) => (
    <pre data-testid="code-block" data-language={language}>
      {code}
    </pre>
  ),
}));

describe("MessageBubble", () => {
  const baseProps = {
    id: "msg-1",
    role: "user",
    content: "Hello world",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders user message content", () => {
    render(<MessageBubble {...baseProps} />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders with user-side alignment for user messages", () => {
    const { container } = render(<MessageBubble {...baseProps} role="user" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("flex-row-reverse");
  });

  it("renders without user-side alignment for assistant messages", () => {
    const { container } = render(<MessageBubble {...baseProps} role="assistant" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).not.toContain("flex-row-reverse");
  });

  it("shows pinned indicator when isPinned=true", () => {
    render(<MessageBubble {...baseProps} isPinned={true} />);
    expect(screen.getByText("Pinned")).toBeInTheDocument();
  });

  it("shows excluded indicator when isExcluded=true", () => {
    render(<MessageBubble {...baseProps} isExcluded={true} />);
    expect(screen.getByText("Excluded from context")).toBeInTheDocument();
  });

  it("applies opacity when excluded", () => {
    const { container } = render(<MessageBubble {...baseProps} isExcluded={true} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("opacity-50");
  });

  it("does not show action toolbar for temp messages", () => {
    const onDelete = vi.fn();
    render(<MessageBubble {...baseProps} id="temp-123" onDelete={onDelete} />);
    // Action toolbar has "Delete message" tooltip, so no buttons
    const buttons = screen.queryAllByRole("button");
    expect(buttons).toHaveLength(0);
  });

  it("shows action buttons when callbacks provided", () => {
    const onDelete = vi.fn();
    const onPin = vi.fn();
    render(<MessageBubble {...baseProps} onDelete={onDelete} onPin={onPin} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("calls onDelete when delete button clicked", () => {
    const onDelete = vi.fn();
    render(<MessageBubble {...baseProps} onDelete={onDelete} />);
    // The delete button has a tooltip "Delete message"
    const deleteTooltip = screen.getByText("Delete message");
    // The button is a sibling of the tooltip content
    const toolbarButtons = screen.getAllByRole("button");
    // The last (or only) button should be delete
    fireEvent.click(toolbarButtons[0]);
    expect(onDelete).toHaveBeenCalledWith("msg-1");
  });

  it("calls onPin when pin button clicked", () => {
    const onPin = vi.fn();
    render(<MessageBubble {...baseProps} onPin={onPin} isPinned={false} />);
    // Find the button with "Pin" tooltip
    const pinTooltip = screen.getByText(/preserve during compaction/i);
    // Get parent button
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onPin).toHaveBeenCalledWith("msg-1", true);
  });

  it("calls onExclude when exclude button clicked", () => {
    const onExclude = vi.fn();
    render(<MessageBubble {...baseProps} onExclude={onExclude} isExcluded={false} />);
    const excludeTooltip = screen.getByText("Exclude from context");
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onExclude).toHaveBeenCalledWith("msg-1", true);
  });

  it("enters edit mode when edit button clicked", () => {
    const onEdit = vi.fn();
    render(<MessageBubble {...baseProps} onEdit={onEdit} />);
    const editTooltip = screen.getByText("Edit message");
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("saves edit on Save button click", () => {
    const onEdit = vi.fn();
    render(<MessageBubble {...baseProps} content="Original" onEdit={onEdit} />);
    // Enter edit mode
    const editTooltip = screen.getByText("Edit message");
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    // Change content
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Updated" } });
    // Save
    fireEvent.click(screen.getByText("Save"));
    expect(onEdit).toHaveBeenCalledWith("msg-1", "Updated");
  });

  it("cancels edit on Cancel button click", () => {
    const onEdit = vi.fn();
    render(<MessageBubble {...baseProps} content="Original" onEdit={onEdit} />);
    // Enter edit mode
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    // Change content
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Changed" } });
    // Cancel
    fireEvent.click(screen.getByText("Cancel"));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("saves edit on Ctrl+Enter", () => {
    const onEdit = vi.fn();
    render(<MessageBubble {...baseProps} content="Original" onEdit={onEdit} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Updated via shortcut" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onEdit).toHaveBeenCalledWith("msg-1", "Updated via shortcut");
  });

  it("cancels edit on Escape key", () => {
    const onEdit = vi.fn();
    render(<MessageBubble {...baseProps} content="Original" onEdit={onEdit} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders code blocks within content", () => {
    const content = "Here is code:\n```python\nprint('hi')\n```\nDone.";
    render(<MessageBubble {...baseProps} content={content} />);
    expect(screen.getByTestId("code-block")).toBeInTheDocument();
    expect(screen.getByTestId("code-block")).toHaveAttribute("data-language", "python");
  });

  it("does not save unchanged content", () => {
    const onEdit = vi.fn();
    render(<MessageBubble {...baseProps} content="Same content" onEdit={onEdit} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByText("Save"));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("displays timestamp when provided", () => {
    render(<MessageBubble {...baseProps} createdAt="2026-02-16T10:30:00Z" />);
    // Timestamp is displayed via toLocaleTimeString — just check an element exists
    const timeEl = screen.getByText(/\d{1,2}:\d{2}/);
    expect(timeEl).toBeInTheDocument();
  });
});
