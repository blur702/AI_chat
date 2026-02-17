import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { workstationUiMock, i18nMock, createNextNavigationMock } from "../unit/test-utils";

// ---- Mocks ----

vi.mock("@workstation/ui", () => ({
  ...workstationUiMock,
  ContextMenu: ({ children }: any) => <>{children}</>,
  ContextMenuTrigger: ({ children }: any) => <>{children}</>,
  ContextMenuContent: ({ children }: any) => <div>{children}</div>,
  ContextMenuGroup: ({ children }: any) => <div>{children}</div>,
  ContextMenuItem: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  ContextMenuSeparator: () => <hr />,
}));

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

vi.mock("@/lib/i18n", () => i18nMock);

vi.mock("@/components/help/help-provider", () => ({
  useHelp: () => ({ openHelp: vi.fn() }),
}));

const navMock = createNextNavigationMock();
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ ...navMock.useRouter(), push: pushMock }),
  usePathname: () => "/chat/c1",
  useSearchParams: navMock.useSearchParams,
  useParams: () => ({ chatId: "c1" }),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock sub-components that are tested separately
vi.mock("@/components/chat/compaction-banner", () => ({
  CompactionBanner: ({ compaction }: any) => (
    <div data-testid="compaction">{compaction.id}</div>
  ),
}));

vi.mock("@/components/thinking-indicator", () => ({
  ThinkingIndicator: ({ progress }: any) => (
    <div role="status" data-testid="thinking">
      Thinking... {progress}%
    </div>
  ),
}));

vi.mock("@/components/message-bubble", () => ({
  MessageBubble: ({ id, role, content, onPin, onEdit, onDelete }: any) => (
    <div data-testid={`msg-${id}`} data-role={role}>
      <span>{content}</span>
      {onPin && (
        <button onClick={() => onPin(id, true)}>Pin</button>
      )}
      {onEdit && (
        <button onClick={() => onEdit(id, "edited")}>Edit</button>
      )}
      {onDelete && (
        <button onClick={() => onDelete(id)}>Delete</button>
      )}
    </div>
  ),
}));

// Hooks
const mockChats = [
  { id: "c1", title: "First Chat", is_pinned: false, is_archived: false, updated_at: "2025-06-01" },
  { id: "c2", title: "Second Chat", is_pinned: true, is_archived: false, updated_at: "2025-05-01" },
];

const mockMessages = [
  { id: "m1", role: "user", content: "Hello", is_pinned: false, is_excluded: false, created_at: "2025-06-01T00:00:00Z" },
  { id: "m2", role: "assistant", content: "Hi there!", is_pinned: false, is_excluded: false, created_at: "2025-06-01T00:00:01Z" },
];

const mockSendMessage = vi.fn();
const mockCancelStream = vi.fn();
const mockUpdateMessage = vi.fn();
const mockDeleteMessage = vi.fn();
const mockPinMessage = vi.fn();

vi.mock("@workstation/api/hooks", () => ({
  useChats: () => ({
    chats: mockChats,
    loading: false,
    error: null,
    refresh: vi.fn(),
    updateChat: vi.fn(),
    deleteChat: vi.fn(),
  }),
  useAuth: () => ({
    token: "test-token",
    user: { id: "u1", username: "kevin", role: "admin" },
    logout: vi.fn(),
  }),
  useConversation: () => ({
    messages: mockMessages,
    processing: false,
    progress: 0,
    sendMessage: mockSendMessage,
    cancelStream: mockCancelStream,
    updateMessage: mockUpdateMessage,
    deleteMessage: mockDeleteMessage,
    pinMessage: mockPinMessage,
  }),
  useWebSocket: () => ({ subscribe: () => () => {} }),
}));

vi.mock("@/hooks/use-breakpoint", () => ({
  useBreakpoint: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));

vi.mock("@/hooks/use-swipe", () => ({
  useSwipe: () => ({ ref: { current: null } }),
}));

// Import after mocks
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";

// ---- Tests ----

describe("Chat Flow Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders message thread with messages and input together", () => {
    render(
      <div>
        <MessageThread
          messages={mockMessages}
          loading={false}
          processing={false}
          onPin={mockPinMessage}
          onEdit={mockUpdateMessage}
          onDelete={mockDeleteMessage}
        />
        <MessageInput onSend={mockSendMessage} />
      </div>
    );

    // Thread shows messages
    expect(screen.getByTestId("msg-m1")).toBeInTheDocument();
    expect(screen.getByTestId("msg-m2")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there!")).toBeInTheDocument();

    // Input is present
    expect(screen.getByLabelText("Message input")).toBeInTheDocument();
  });

  it("sends a message via input and triggers sendMessage", async () => {
    render(
      <div>
        <MessageThread
          messages={mockMessages}
          loading={false}
          processing={false}
        />
        <MessageInput onSend={mockSendMessage} />
      </div>
    );

    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "New message" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith("New message");
    });
  });

  it("shows thinking indicator when processing", () => {
    render(
      <div>
        <MessageThread
          messages={mockMessages}
          loading={false}
          processing={true}
          progress={42}
        />
        <MessageInput
          onSend={mockSendMessage}
          processing={true}
          onStop={mockCancelStream}
        />
      </div>
    );

    expect(screen.getByTestId("thinking")).toBeInTheDocument();
    expect(screen.getByText(/42%/)).toBeInTheDocument();
    // Stop button should be visible
    expect(screen.getByLabelText("Stop generating")).toBeInTheDocument();
  });

  it("stops generation via Escape key", () => {
    render(
      <MessageInput
        onSend={mockSendMessage}
        processing={true}
        onStop={mockCancelStream}
      />
    );

    const textarea = screen.getByLabelText("Message input");
    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(mockCancelStream).toHaveBeenCalled();
  });

  it("stops generation via stop button", () => {
    render(
      <MessageInput
        onSend={mockSendMessage}
        processing={true}
        onStop={mockCancelStream}
      />
    );

    fireEvent.click(screen.getByLabelText("Stop generating"));
    expect(mockCancelStream).toHaveBeenCalled();
  });

  it("shows loading state in thread", () => {
    render(
      <div>
        <MessageThread messages={[]} loading={true} />
        <MessageInput onSend={mockSendMessage} disabled={true} />
      </div>
    );

    expect(screen.getByLabelText("Loading messages")).toBeInTheDocument();
  });

  it("shows empty state when no messages", () => {
    render(
      <MessageThread messages={[]} loading={false} />
    );

    expect(screen.getByText("No messages yet. Start a conversation!")).toBeInTheDocument();
  });

  it("pin action on message bubble triggers callback", () => {
    render(
      <MessageThread
        messages={mockMessages}
        loading={false}
        onPin={mockPinMessage}
      />
    );

    const pinButtons = screen.getAllByText("Pin");
    fireEvent.click(pinButtons[0]);

    expect(mockPinMessage).toHaveBeenCalledWith("m1", true);
  });

  it("delete action on message bubble triggers callback", () => {
    render(
      <MessageThread
        messages={mockMessages}
        loading={false}
        onDelete={mockDeleteMessage}
      />
    );

    const deleteButtons = screen.getAllByText("Delete");
    fireEvent.click(deleteButtons[0]);

    expect(mockDeleteMessage).toHaveBeenCalledWith("m1");
  });

  it("Shift+Enter does not send, adds newline behavior", async () => {
    render(
      <MessageInput onSend={mockSendMessage} />
    );

    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "line1" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    // Should NOT have been called
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("does not send empty messages", async () => {
    render(
      <MessageInput onSend={mockSendMessage} />
    );

    const textarea = screen.getByLabelText("Message input");
    // Leave empty
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
