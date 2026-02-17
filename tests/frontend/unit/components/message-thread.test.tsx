import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock child components BEFORE importing MessageThread
vi.mock("@workstation/ui", () => ({
  ScrollArea: ({ children }: any) => <div data-testid="scroll-area">{children}</div>,
  Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/message-bubble", () => ({
  MessageBubble: ({ id, role, content }: any) => (
    <div data-testid={`message-${id}`} data-role={role}>
      {content}
    </div>
  ),
}));

vi.mock("@/components/thinking-indicator", () => ({
  ThinkingIndicator: ({ progress }: any) => (
    <div data-testid="thinking-indicator" data-progress={progress} />
  ),
}));

vi.mock("@/components/chat/compaction-banner", () => ({
  CompactionBanner: ({ compaction }: any) => (
    <div data-testid={`compaction-${compaction.id}`}>{compaction.summary}</div>
  ),
}));

import { MessageThread } from "@/components/message-thread";

describe("MessageThread", () => {
  const mockMessages = [
    {
      id: "msg-1",
      role: "user",
      content: "Hello",
      is_pinned: false,
      is_excluded: false,
      created_at: "2026-02-16T10:00:00Z",
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "Hi there!",
      is_pinned: false,
      is_excluded: false,
      created_at: "2026-02-16T10:00:01Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeletons when loading=true", () => {
    render(<MessageThread messages={[]} loading={true} />);
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("has aria-busy when loading", () => {
    const { container } = render(<MessageThread messages={[]} loading={true} />);
    const loadingDiv = container.querySelector('[aria-busy="true"]');
    expect(loadingDiv).not.toBeNull();
  });

  it("shows empty state when no messages and not loading (production)", () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    render(<MessageThread messages={[]} loading={false} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    process.env.NODE_ENV = origEnv;
  });

  it("renders all message bubbles", () => {
    render(<MessageThread messages={mockMessages} loading={false} />);
    expect(screen.getByTestId("message-msg-1")).toBeInTheDocument();
    expect(screen.getByTestId("message-msg-2")).toBeInTheDocument();
  });

  it("renders message content", () => {
    render(<MessageThread messages={mockMessages} loading={false} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  it("shows thinking indicator when processing=true", () => {
    render(
      <MessageThread messages={mockMessages} loading={false} processing={true} progress={50} />
    );
    expect(screen.getByTestId("thinking-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("thinking-indicator")).toHaveAttribute("data-progress", "50");
  });

  it("does not show thinking indicator when processing=false", () => {
    render(
      <MessageThread messages={mockMessages} loading={false} processing={false} />
    );
    expect(screen.queryByTestId("thinking-indicator")).not.toBeInTheDocument();
  });

  it("has role='log' for the message list", () => {
    render(<MessageThread messages={mockMessages} loading={false} />);
    expect(screen.getByRole("log")).toBeInTheDocument();
  });

  it("renders compaction banners when provided", () => {
    const compactions = [
      {
        id: "c-1",
        original_message_count: 10,
        compacted_message_count: 2,
        summary: "Conversation about setup",
      },
    ];
    render(
      <MessageThread
        messages={mockMessages}
        compactions={compactions}
        loading={false}
      />
    );
    expect(screen.getByTestId("compaction-c-1")).toBeInTheDocument();
    expect(screen.getByText("Conversation about setup")).toBeInTheDocument();
  });
});
