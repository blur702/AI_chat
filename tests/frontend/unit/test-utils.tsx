import React from "react";
import { vi } from "vitest";

/**
 * Factory for a mock @workstation/api/client getClient() return value.
 * All methods are vi.fn() stubs.
 */
export function createMockClient() {
  return {
    // Auth
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn(),
    setToken: vi.fn(),

    // Conversations
    getConversationState: vi.fn(),
    createChat: vi.fn(),
    streamMessage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    submitToolApproval: vi.fn(),

    // Chats
    getProjectChats: vi.fn(),
    updateChat: vi.fn(),
    deleteChat: vi.fn(),
    updateChatMode: vi.fn(),

    // Projects
    listProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),

    // Models
    listModels: vi.fn(),
    listOllamaModels: vi.fn(),
    loadOllamaModel: vi.fn(),
    unloadOllamaModel: vi.fn(),
    pullOllamaModel: vi.fn(),
    deleteOllamaModel: vi.fn(),

    // Settings
    updateUser: vi.fn(),
    changePassword: vi.fn(),
    getUserPreferences: vi.fn(),
    updateUserPreferences: vi.fn(),

    // Kernel
    kernelStatus: vi.fn(),

    // Knowledge Base
    listKbSources: vi.fn(),
    uploadKbSource: vi.fn(),
    deleteKbSource: vi.fn(),

    // Image Generation
    generateImage: vi.fn(),
    getImageHistory: vi.fn(),

    // Context
    getContextDashboard: vi.fn(),
    updateContextEditor: vi.fn(),

    // Snippets
    listSnippets: vi.fn(),
    createSnippet: vi.fn(),
    updateSnippet: vi.fn(),
    deleteSnippet: vi.fn(),

    // System Prompts
    listSystemPrompts: vi.fn(),
    createSystemPrompt: vi.fn(),
    updateSystemPrompt: vi.fn(),
    deleteSystemPrompt: vi.fn(),

    // Admin
    listUsers: vi.fn(),
    getAuditLogs: vi.fn(),
    getSystemHealth: vi.fn(),

    // Resources / VRAM
    getVRAMStats: vi.fn(),
    getResourceStatus: vi.fn(),
    submitOffloadDecision: vi.fn(),
    reloadResource: vi.fn(),
  };
}

/**
 * Passthrough mock for @workstation/ui components.
 * Each component renders its children as-is (or relevant HTML element).
 */
export const workstationUiMock = {
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <div role="tooltip">{children}</div>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  Dialog: ({ children, open }: any) => (open !== false ? <div role="dialog">{children}</div> : null),
  DialogTrigger: ({ children }: any) => <>{children}</>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  Sheet: ({ children, open }: any) => (open !== false ? <div>{children}</div> : null),
  SheetTrigger: ({ children }: any) => <>{children}</>,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  Input: (props: any) => <input {...props} />,
  Textarea: (props: any) => <textarea {...props} />,
  ScrollArea: ({ children }: any) => <div>{children}</div>,
  ScrollBar: () => null,
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
  Tabs: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value, ...props }: any) => (
    <button role="tab" data-value={value} {...props}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: any) => <div role="tabpanel" data-value={value}>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Separator: () => <hr />,
  Progress: ({ value }: any) => <div role="progressbar" aria-valuenow={value} />,
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <button role="switch" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)} {...props} />
  ),
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
  SkipNav: () => null,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
};

/**
 * Mock for @/lib/i18n translation function.
 */
export const i18nMock = {
  t: (key: string) => key,
};

/**
 * Mock for next/navigation.
 */
export function createNextNavigationMock() {
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
      refresh: vi.fn(),
    }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
}
