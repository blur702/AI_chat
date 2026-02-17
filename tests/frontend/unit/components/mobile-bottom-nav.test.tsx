import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { workstationUiMock } from "../test-utils";

const mockPush = vi.fn();
const mockCreateChat = vi.fn().mockResolvedValue({ id: "new-chat-id" });

vi.mock("@workstation/ui", () => ({
  ...workstationUiMock,
  useBreakpoint: () => ({ isMobile: true, isTablet: false, isDesktop: false }),
}));

vi.mock("@workstation/api", () => ({
  getClient: () => ({
    createChat: mockCreateChat,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => ({ children, ...props }: any) => <span data-icon={name} {...props}>{children}</span>,
}));

import { MobileBottomNav } from "@/components/mobile-bottom-nav";

describe("MobileBottomNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      localStorage.setItem("workstation_chat_project_id", "proj1");
    } catch {
      // noop
    }
  });

  it("renders navigation items", () => {
    render(<MobileBottomNav />);
    expect(screen.getByText("New Chat")).toBeInTheDocument();
    expect(screen.getByText("Chats")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("has mobile navigation role", () => {
    render(<MobileBottomNav />);
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
  });

  it("creates new chat on click", async () => {
    render(<MobileBottomNav />);
    const newChatBtn = screen.getByText("New Chat");
    fireEvent.click(newChatBtn);

    await waitFor(() => {
      expect(mockCreateChat).toHaveBeenCalledWith("proj1", "New Chat");
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/chat/new-chat-id");
    });
  });

  it("links to correct routes", () => {
    render(<MobileBottomNav />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/chat");
    expect(hrefs).toContain("/settings");
  });

  it("does not create chat without projectId", async () => {
    try {
      localStorage.removeItem("workstation_chat_project_id");
    } catch {
      // noop
    }
    render(<MobileBottomNav />);
    const newChatBtn = screen.getByText("New Chat");
    fireEvent.click(newChatBtn);

    // Should not call createChat
    expect(mockCreateChat).not.toHaveBeenCalled();
  });
});
