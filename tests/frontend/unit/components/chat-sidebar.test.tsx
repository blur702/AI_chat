import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { workstationUiMock, i18nMock } from "../test-utils";

const mockPush = vi.fn();
const mockLogout = vi.fn();
const mockRefresh = vi.fn().mockResolvedValue(undefined);
const mockUpdateChat = vi.fn().mockResolvedValue(undefined);
const mockDeleteChat = vi.fn().mockResolvedValue(undefined);
const mockOpenHelp = vi.fn();

let mockChats: any[] = [];

vi.mock("@workstation/ui", () => ({
  ...workstationUiMock,
  ContextMenu: ({ children }: any) => <>{children}</>,
  ContextMenuTrigger: ({ children }: any) => <>{children}</>,
  ContextMenuContent: ({ children }: any) => <div>{children}</div>,
  ContextMenuItem: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  ContextMenuSeparator: () => <hr />,
  DialogClose: ({ children }: any) => <>{children}</>,
  useBreakpoint: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
  useSwipe: () => ({}),
}));

vi.mock("@workstation/api", () => ({
  useChats: () => ({
    chats: mockChats,
    loading: false,
    error: null,
    refresh: mockRefresh,
    updateChat: mockUpdateChat,
    deleteChat: mockDeleteChat,
  }),
  useAuth: () => ({ logout: mockLogout }),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, onClick, ...props }: any) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  __esModule: true,
  usePathname: () => "/chat",
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => {
    if (name === "__esModule") return true;
    return ({ children, ...props }: any) => <span data-icon={String(name)} {...props}>{children}</span>;
  },
}));

vi.mock("@/lib/i18n", () => i18nMock);

vi.mock("@/components/help/help-provider", () => ({
  useHelp: () => ({ openHelp: mockOpenHelp }),
}));

import { ChatSidebar } from "@/components/chat-sidebar";

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChats = [
      { id: "c1", title: "First Chat", is_pinned: false, is_archived: false },
      { id: "c2", title: "Pinned Chat", is_pinned: true, is_archived: false },
      { id: "c3", title: "Archived Chat", is_pinned: false, is_archived: true },
    ];
  });

  it("renders chat list", () => {
    render(<ChatSidebar projectId="proj1" />);
    expect(screen.getByText("First Chat")).toBeInTheDocument();
    expect(screen.getByText("Pinned Chat")).toBeInTheDocument();
    expect(screen.getByText("Archived Chat")).toBeInTheDocument();
  });

  it("shows pinned section when pinned chats exist", () => {
    render(<ChatSidebar projectId="proj1" />);
    expect(screen.getByText("pinned")).toBeInTheDocument();
  });

  it("shows archived section when archived chats exist", () => {
    render(<ChatSidebar projectId="proj1" />);
    expect(screen.getByText("archived")).toBeInTheDocument();
  });

  it("renders help button in sidebar", () => {
    render(<ChatSidebar projectId="proj1" />);
    expect(screen.getByText("help")).toBeInTheDocument();
    expect(screen.getByLabelText("Help")).toBeInTheDocument();
  });

  it("navigates to new chat on button click", () => {
    render(<ChatSidebar projectId="proj1" />);
    const newChatBtn = screen.getByLabelText("Create new chat");
    fireEvent.click(newChatBtn);
    expect(mockPush).toHaveBeenCalledWith("/chat/new");
  });

  it("does not navigate without project", () => {
    render(<ChatSidebar projectId={null} />);
    const newChatBtn = screen.getByLabelText("Create new chat");
    fireEvent.click(newChatBtn);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("has navigation role", () => {
    render(<ChatSidebar projectId="proj1" />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("has chat list role", () => {
    render(<ChatSidebar projectId="proj1" />);
    expect(screen.getByRole("list", { name: "Chat list" })).toBeInTheDocument();
  });

  it("calls openHelp when help button is clicked", () => {
    render(<ChatSidebar projectId="proj1" />);
    const helpBtn = screen.getByLabelText("Help");
    fireEvent.click(helpBtn);
    expect(mockOpenHelp).toHaveBeenCalled();
  });

  it("shows empty state when no chats", () => {
    mockChats = [];
    render(<ChatSidebar projectId="proj1" />);
    expect(screen.getByText("noChatsYet")).toBeInTheDocument();
  });
});
