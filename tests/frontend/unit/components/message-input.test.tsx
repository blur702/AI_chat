import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageInput } from "@/components/message-input";

// Mock modules
vi.mock("@/components/help/help-provider", () => ({
  useHelp: () => ({
    openHelp: vi.fn(),
    closeHelp: vi.fn(),
    isOpen: false,
    activeSection: null,
  }),
}));

vi.mock("@workstation/ui", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      typeMessage: "Type a message...",
    };
    return translations[key] || key;
  },
}));

describe("MessageInput", () => {
  let mockOnSend: ReturnType<typeof vi.fn>;
  let mockOnStop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnSend = vi.fn();
    mockOnStop = vi.fn();
  });

  it("renders textarea with default placeholder", () => {
    render(<MessageInput onSend={mockOnSend} />);
    const textarea = screen.getByLabelText("Message input");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute("placeholder", "Type a message...");
  });

  it("renders custom placeholder when provided", () => {
    render(<MessageInput onSend={mockOnSend} placeholder="Custom placeholder text" />);
    const textarea = screen.getByLabelText("Message input");
    expect(textarea).toHaveAttribute("placeholder", "Custom placeholder text");
  });

  it("send button disabled when input is empty", () => {
    render(<MessageInput onSend={mockOnSend} />);
    const sendButton = screen.getByLabelText("Send message");
    expect(sendButton).toBeDisabled();
  });

  it("send button enabled when input has text", () => {
    render(<MessageInput onSend={mockOnSend} />);
    const textarea = screen.getByLabelText("Message input");
    const sendButton = screen.getByLabelText("Send message");

    fireEvent.change(textarea, { target: { value: "Hello" } });
    expect(sendButton).not.toBeDisabled();
  });

  it("calls onSend with trimmed text on button click", async () => {
    render(<MessageInput onSend={mockOnSend} />);
    const textarea = screen.getByLabelText("Message input");
    const sendButton = screen.getByLabelText("Send message");

    fireEvent.change(textarea, { target: { value: "  Hello World  " } });
    fireEvent.click(sendButton);

    expect(mockOnSend).toHaveBeenCalledWith("Hello World");
  });

  it("clears input after sending", () => {
    render(<MessageInput onSend={mockOnSend} />);
    const textarea = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    const sendButton = screen.getByLabelText("Send message");

    fireEvent.change(textarea, { target: { value: "Test message" } });
    expect(textarea.value).toBe("Test message");

    fireEvent.click(sendButton);
    expect(textarea.value).toBe("");
  });

  it("Enter key submits message", () => {
    render(<MessageInput onSend={mockOnSend} />);
    const textarea = screen.getByLabelText("Message input");

    fireEvent.change(textarea, { target: { value: "Test message" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(mockOnSend).toHaveBeenCalledWith("Test message");
  });

  it("Shift+Enter does NOT submit (allows newline)", () => {
    render(<MessageInput onSend={mockOnSend} />);
    const textarea = screen.getByLabelText("Message input");

    fireEvent.change(textarea, { target: { value: "Test message" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it("shows stop button when processing=true", () => {
    render(<MessageInput onSend={mockOnSend} onStop={mockOnStop} processing={true} />);
    const stopButton = screen.getByLabelText("Stop generating");
    expect(stopButton).toBeInTheDocument();
  });

  it("calls onStop when stop button clicked", () => {
    render(<MessageInput onSend={mockOnSend} onStop={mockOnStop} processing={true} />);
    const stopButton = screen.getByLabelText("Stop generating");

    fireEvent.click(stopButton);
    expect(mockOnStop).toHaveBeenCalled();
  });

  it("Escape key calls onStop when processing", () => {
    render(<MessageInput onSend={mockOnSend} onStop={mockOnStop} processing={true} />);
    const textarea = screen.getByLabelText("Message input");

    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(mockOnStop).toHaveBeenCalled();
  });

  it("does not send when disabled", () => {
    render(<MessageInput onSend={mockOnSend} disabled={true} />);
    const textarea = screen.getByLabelText("Message input");
    const sendButton = screen.getByLabelText("Send message");

    fireEvent.change(textarea, { target: { value: "Test message" } });
    fireEvent.click(sendButton);

    expect(mockOnSend).not.toHaveBeenCalled();
  });
});
