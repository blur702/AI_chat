import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { workstationUiMock, i18nMock, createNextNavigationMock } from "../unit/test-utils";

// ---- Mocks ----

vi.mock("@workstation/ui", () => ({
  ...workstationUiMock,
  useBreakpoint: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
  ThemeToggle: () => <button aria-label="Toggle theme">Theme</button>,
  DropdownMenu: ({ children }: any) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
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
vi.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: navMock.useRouter,
  usePathname: navMock.usePathname,
  useSearchParams: navMock.useSearchParams,
  useParams: () => ({ projectId: "p1" }),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { WorkspaceToolbar } from "@/components/workspace/workspace-toolbar";

// ---- Tests ----

describe("Workspace Panels Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("WorkspaceToolbar button actions", () => {
    const handlers = {
      onFilesClick: vi.fn(),
      onRunClick: vi.fn(),
      onChatClick: vi.fn(),
      onActionsClick: vi.fn(),
      onHistoryClick: vi.fn(),
      onImageGenClick: vi.fn(),
      onResourcesClick: vi.fn(),
      onToolsClick: vi.fn(),
      onEventsClick: vi.fn(),
      onDrupalClick: vi.fn(),
      onKBClick: vi.fn(),
      onSnapshotsClick: vi.fn(),
      onContextClick: vi.fn(),
      onUIBuilderClick: vi.fn(),
      onPlanningClick: vi.fn(),
      onKBBuilderClick: vi.fn(),
      onCloseProject: vi.fn(),
      onSettingsClick: vi.fn(),
    };

    it("renders toolbar with key buttons", () => {
      render(<WorkspaceToolbar {...handlers} />);
      // Buttons render the i18n key as text (mock returns key as-is)
      expect(screen.getByText("files")).toBeInTheDocument();
      expect(screen.getByText("run")).toBeInTheDocument();
      expect(screen.getByText("aiChat")).toBeInTheDocument();
    });

    it("calls onFilesClick when Files button clicked", () => {
      render(<WorkspaceToolbar {...handlers} />);
      fireEvent.click(screen.getByText("files"));
      expect(handlers.onFilesClick).toHaveBeenCalled();
    });

    it("calls onRunClick when Run button clicked", () => {
      render(<WorkspaceToolbar {...handlers} />);
      fireEvent.click(screen.getByText("run"));
      expect(handlers.onRunClick).toHaveBeenCalled();
    });

    it("calls onChatClick when Chat button clicked", () => {
      render(<WorkspaceToolbar {...handlers} />);
      fireEvent.click(screen.getByText("aiChat"));
      expect(handlers.onChatClick).toHaveBeenCalled();
    });

    it("calls onImageGenClick when Image Gen button clicked", () => {
      render(<WorkspaceToolbar {...handlers} />);
      fireEvent.click(screen.getByText("images"));
      expect(handlers.onImageGenClick).toHaveBeenCalled();
    });

    it("calls onCloseProject when close project clicked", () => {
      render(<WorkspaceToolbar {...handlers} />);
      fireEvent.click(screen.getByLabelText("Close Project"));
      expect(handlers.onCloseProject).toHaveBeenCalled();
    });

    it("shows pending actions badge", () => {
      render(<WorkspaceToolbar {...handlers} pendingActionsCount={5} />);
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("caps badge at 9+", () => {
      render(<WorkspaceToolbar {...handlers} pendingActionsCount={15} />);
      expect(screen.getByText("9+")).toBeInTheDocument();
    });

    it("shows tools count badge", () => {
      render(<WorkspaceToolbar {...handlers} toolsCount={8} />);
      expect(screen.getByText("8")).toBeInTheDocument();
    });

    it("calls onContextClick when Context button clicked", () => {
      render(<WorkspaceToolbar {...handlers} />);
      fireEvent.click(screen.getByText("context"));
      expect(handlers.onContextClick).toHaveBeenCalled();
    });

    it("calls onSettingsClick when Settings button clicked", () => {
      render(<WorkspaceToolbar {...handlers} />);
      fireEvent.click(screen.getByLabelText("Settings"));
      expect(handlers.onSettingsClick).toHaveBeenCalled();
    });

    it("renders workspace branding link", () => {
      render(<WorkspaceToolbar {...handlers} />);
      expect(screen.getByText("AI Workstation")).toBeInTheDocument();
    });

    it("shows history button on desktop", () => {
      render(<WorkspaceToolbar {...handlers} />);
      expect(screen.getByText("history")).toBeInTheDocument();
    });

    it("calls onHistoryClick when History button clicked", () => {
      render(<WorkspaceToolbar {...handlers} />);
      fireEvent.click(screen.getByText("history"));
      expect(handlers.onHistoryClick).toHaveBeenCalled();
    });

    it("calls onEventsClick when Events button clicked", () => {
      render(<WorkspaceToolbar {...handlers} />);
      fireEvent.click(screen.getByText("events"));
      expect(handlers.onEventsClick).toHaveBeenCalled();
    });

    it("shows Quick Execute in tools dropdown", () => {
      render(<WorkspaceToolbar {...handlers} />);
      expect(screen.getByText("Quick Execute")).toBeInTheDocument();
    });

    it("shows All Tools in tools dropdown", () => {
      render(<WorkspaceToolbar {...handlers} />);
      expect(screen.getByText("All Tools")).toBeInTheDocument();
    });

    it("shows pinned tools section when pinnedTools provided", () => {
      render(
        <WorkspaceToolbar
          {...handlers}
          pinnedTools={[{ name: "grep_search" } as any]}
          onQuickExecuteTool={vi.fn()}
        />
      );
      expect(screen.getByText("Pinned Tools")).toBeInTheDocument();
      expect(screen.getByText("grep_search")).toBeInTheDocument();
    });
  });
});
