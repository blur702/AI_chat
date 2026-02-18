"use client";

import { useState, useRef, useCallback, useEffect, memo, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Button,
  ScrollArea,
  Input,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  cn,
  useBreakpoint,
  useSwipe,
} from "@workstation/ui";
import { useChats, useAuth } from "@workstation/api";
import { Plus, MessageSquare, Settings, Pin, Archive, Trash2, Pencil, Loader2, LogOut, Code2, Monitor, Globe, HelpCircle, Palette, ImageIcon, Film, ShieldCheck } from "lucide-react";
import { useHelp } from "./help/help-provider";
import { t } from "@/lib/i18n";

interface ChatSidebarProps {
  projectId: string | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function ChatSidebar({ projectId, mobileOpen: mobileOpenProp, onMobileClose: onMobileCloseProp }: ChatSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { openHelp } = useHelp();
  const { chats, loading, error, refresh, updateChat, deleteChat } = useChats(projectId);
  const { isMobile } = useBreakpoint();
  const sidebarRef = useRef<HTMLElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const internalClose = useCallback(() => setInternalOpen(false), []);
  const mobileOpen = mobileOpenProp ?? internalOpen;
  const onMobileClose = onMobileCloseProp ?? internalClose;

  const swipeHandlers = useSwipe(sidebarRef, {
    onSwipeLeft: () => onMobileClose(),
  });

  const handleChatSelect = () => {
    if (isMobile) onMobileClose();
  };

  // Refresh chat list when a new chat is created from the draft page
  useEffect(() => {
    const handler = () => { refresh(); };
    window.addEventListener("chat-list-refresh", handler);
    return () => window.removeEventListener("chat-list-refresh", handler);
  }, [refresh]);

  const handleLogout = useCallback(() => {
    logout();
    router.push("/login");
  }, [logout, router]);

  const handleNewChat = useCallback(() => {
    setOperationError(null);
    if (!projectId) {
      setOperationError("No project selected. Please select a project first.");
      return;
    }
    router.push("/chat/new");
    if (isMobile) onMobileClose();
  }, [projectId, router, isMobile, onMobileClose]);

  const handleRename = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      setOperationError(null);
      await updateChat(renameTarget.id, { title: renameValue.trim() });
      setRenameTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to rename chat:", err);
      setOperationError(`Failed to rename chat: ${message}`);
    }
  }, [renameTarget, renameValue, updateChat]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    try {
      setOperationError(null);
      await deleteChat(deletedId);
      setDeleteTarget(null);
      if (pathname === `/chat/${deletedId}`) {
        router.push("/chat");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to delete chat:", err);
      setOperationError(`Failed to delete chat: ${message}`);
    }
  }, [deleteTarget, deleteChat, pathname, router]);

  const handleTogglePin = useCallback(
    async (chatId: string, currentlyPinned: boolean) => {
      try {
        setOperationError(null);
        await updateChat(chatId, { is_pinned: !currentlyPinned });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Failed to toggle pin:", err);
        setOperationError(`Failed to update pin state: ${message}`);
      }
    },
    [updateChat]
  );

  const handleToggleArchive = useCallback(
    async (chatId: string, currentlyArchived: boolean) => {
      try {
        setOperationError(null);
        await updateChat(chatId, { is_archived: !currentlyArchived });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Failed to toggle archive:", err);
        setOperationError(`Failed to update archive state: ${message}`);
      }
    },
    [updateChat]
  );

  const handleOpenRename = useCallback((id: string, title: string) => {
    setRenameTarget({ id, title });
    setRenameValue(title);
  }, []);

  const handleOpenDelete = useCallback((id: string, title: string) => {
    setDeleteTarget({ id, title });
  }, []);

  const sidebarContent = (
    <SidebarContent
      projectId={projectId}
      chats={chats}
      pathname={pathname}
      loading={loading}
      error={error}
      operationError={operationError}
      onChatSelect={handleChatSelect}
      onNewChat={handleNewChat}
      onLogout={handleLogout}
      onRename={handleOpenRename}
      onDelete={handleOpenDelete}
      onTogglePin={handleTogglePin}
      onToggleArchive={handleToggleArchive}
      onHelp={openHelp}
    />
  );

  const dialogs = (
    <>
      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("renameChat")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            placeholder="Chat title"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteChat")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteChatConfirm", { title: deleteTarget?.title ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  // On mobile, render as overlay
  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-standard"
            onClick={onMobileClose}
            aria-hidden="true"
          />
        )}
        <nav
          ref={sidebarRef}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-sidebar transition-transform duration-standard ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
          role="navigation"
          aria-label="Chat navigation"
          aria-hidden={!mobileOpen}
          {...swipeHandlers}
        >
          {sidebarContent}
        </nav>
        {dialogs}
      </>
    );
  }

  // Desktop: fixed sidebar
  return (
    <>
      <nav
        ref={sidebarRef}
        className="flex h-full w-64 flex-col border-r bg-sidebar"
        role="navigation"
        aria-label="Chat navigation"
      >
        {sidebarContent}
      </nav>
      {dialogs}
    </>
  );
}

interface SidebarContentProps {
  projectId: string | null;
  chats: { id: string; title: string; is_pinned?: boolean; is_archived?: boolean; created_at?: string; updated_at?: string }[];
  pathname: string;
  loading: boolean;
  error: string | null;
  operationError: string | null;
  onChatSelect?: () => void;
  onNewChat: () => void;
  onLogout: () => void;
  onHelp: (sectionId?: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string, currentlyPinned: boolean) => void;
  onToggleArchive: (id: string, currentlyArchived: boolean) => void;
}

const SidebarContent = memo(function SidebarContent({
  projectId,
  chats,
  pathname,
  loading,
  error,
  operationError,
  onChatSelect,
  onNewChat,
  onLogout,
  onHelp,
  onRename,
  onDelete,
  onTogglePin,
  onToggleArchive,
}: SidebarContentProps) {
  const pinnedChats = useMemo(() => chats.filter((c) => c.is_pinned && !c.is_archived), [chats]);
  const regularChats = useMemo(() => chats.filter((c) => !c.is_pinned && !c.is_archived), [chats]);
  const archivedChats = useMemo(() => chats.filter((c) => c.is_archived), [chats]);

  return (
    <>
      <div className="flex items-center justify-between p-4">
        <h2 className="text-sm font-semibold text-sidebar-foreground">{t("chats")}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewChat}
          aria-label="Create new chat"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        {(error || operationError) && (
          <div className="px-3 py-2 space-y-1">
            {error && <p className="text-xs text-destructive">{error}</p>}
            {operationError && <p className="text-xs text-destructive">{operationError}</p>}
          </div>
        )}
        {loading && chats.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : chats.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {t("noChatsYet")}
          </p>
        ) : (
          <div className="space-y-1" role="list" aria-label="Chat list">
            {pinnedChats.length > 0 && (
              <>
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground">{t("pinned")}</p>
                {pinnedChats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={pathname === `/chat/${chat.id}`}
                    onSelect={onChatSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                    onTogglePin={onTogglePin}
                    onToggleArchive={onToggleArchive}
                  />
                ))}
              </>
            )}
            {regularChats.length > 0 && (
              <>
                {pinnedChats.length > 0 && (
                  <p className="px-3 py-1 text-xs font-medium text-muted-foreground">{t("recent")}</p>
                )}
                {regularChats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={pathname === `/chat/${chat.id}`}
                    onSelect={onChatSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                    onTogglePin={onTogglePin}
                    onToggleArchive={onToggleArchive}
                  />
                ))}
              </>
            )}
            {archivedChats.length > 0 && (
              <>
                <p className="px-3 py-1 pt-2 text-xs font-medium text-muted-foreground">{t("archived")}</p>
                {archivedChats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={pathname === `/chat/${chat.id}`}
                    onSelect={onChatSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                    onTogglePin={onTogglePin}
                    onToggleArchive={onToggleArchive}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </ScrollArea>

      <TooltipProvider delayDuration={300}>
        <div className="border-t p-2 mt-2 space-y-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/projects"
                onClick={onChatSelect}
                className={cn(
                  "flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  pathname === "/projects" && "bg-accent text-accent-foreground"
                )}
              >
                <Code2 className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">{t("projects")}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Manage your projects</p>
              <button type="button" className="text-xs text-primary hover:underline mt-1 block" onClick={(e) => { e.stopPropagation(); onHelp("sidebar-projects"); }} aria-label="Learn more about projects">Learn more</button>
            </TooltipContent>
          </Tooltip>
          {projectId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/workspace/${projectId}`}
                  onClick={onChatSelect}
                  className="flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                  <span className="text-sm">{t("openIDE")}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Open the workspace IDE with editor, terminal, and tools</p>
                <button type="button" className="text-xs text-primary hover:underline mt-1 block" onClick={(e) => { e.stopPropagation(); onHelp("sidebar-ide"); }} aria-label="Learn more about IDE">Learn more</button>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/drupal"
                onClick={onChatSelect}
                className={cn(
                  "flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  pathname === "/drupal" && "bg-accent text-accent-foreground"
                )}
              >
                <Globe className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">{t("Drupal")}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Manage your Drupal site</p>
              <button type="button" className="text-xs text-primary hover:underline mt-1 block" onClick={(e) => { e.stopPropagation(); onHelp("sidebar-drupal"); }} aria-label="Learn more about Drupal manager">Learn more</button>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/settings"
                onClick={onChatSelect}
                className={cn(
                  "flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  pathname === "/settings" && "bg-accent text-accent-foreground"
                )}
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">{t("settings")}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>User preferences and configuration</p>
              <button type="button" className="text-xs text-primary hover:underline mt-1 block" onClick={(e) => { e.stopPropagation(); onHelp("sidebar-settings"); }} aria-label="Learn more about settings">Learn more</button>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/palettes"
                onClick={onChatSelect}
                className={cn(
                  "flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  pathname === "/palettes" && "bg-accent text-accent-foreground"
                )}
              >
                <Palette className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">{t("Palettes")}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Create and reuse saved color palettes anywhere</p>
              <button type="button" className="text-xs text-primary hover:underline mt-1 block" onClick={(e) => { e.stopPropagation(); onHelp("sidebar-palettes"); }} aria-label="Learn more about palettes">Learn more</button>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={projectId ? `/workspace/${projectId}/image-gen` : "#"}
                onClick={onChatSelect}
                className="flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">{t("Images")}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Generate and browse AI images</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/studio"
                onClick={onChatSelect}
                className={cn(
                  "flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  pathname === "/studio" && "bg-accent text-accent-foreground"
                )}
              >
                <Film className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">Studio</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Create e-learning videos with screen recordings</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/admin"
                onClick={onChatSelect}
                className={cn(
                  "flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  pathname === "/admin" && "bg-accent text-accent-foreground"
                )}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">Admin</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>System administration and monitoring</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onHelp()}
                className="flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Help"
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">{t("help")}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Browse help topics and search for answers</p>
              <button type="button" className="text-xs text-primary hover:underline mt-1 block" onClick={(e) => { e.stopPropagation(); onHelp("sidebar-help"); }} aria-label="Learn more about help">Learn more</button>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onLogout}
                className="flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">{t("logOut")}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Sign out of your account</p>
              <button type="button" className="text-xs text-primary hover:underline mt-1 block" onClick={(e) => { e.stopPropagation(); onHelp("sidebar-logout"); }} aria-label="Learn more about logging out">Learn more</button>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </>
  );
});

const ChatItem = memo(function ChatItem({
  chat,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  onToggleArchive,
}: {
  chat: { id: string; title: string; is_pinned?: boolean; is_archived?: boolean };
  isActive: boolean;
  onSelect?: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string, currentlyPinned: boolean) => void;
  onToggleArchive: (id: string, currentlyArchived: boolean) => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="listitem"
          className={cn(
            "group relative flex items-center gap-2 rounded-md text-sm transition-colors min-h-[44px]",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <Link
            href={`/chat/${chat.id}`}
            aria-current={isActive ? "page" : undefined}
            onClick={onSelect}
            className="flex items-center gap-2 px-3 py-2.5 pr-[4.5rem] flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
          >
            <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{chat.title}</span>
            {chat.is_pinned && (
              <Pin className="ml-auto h-3 w-3 shrink-0 text-muted-foreground group-hover:hidden" aria-label="Pinned" />
            )}
          </Link>
          <div
            role="toolbar"
            aria-label="Chat actions"
            className="absolute right-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRename(chat.id, chat.title); }}
              className="p-1 rounded hover:bg-sidebar-accent"
              title="Rename"
              aria-label="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTogglePin(chat.id, !!chat.is_pinned); }}
              className="p-1 rounded hover:bg-sidebar-accent"
              title={chat.is_pinned ? "Unpin" : "Pin"}
              aria-label={chat.is_pinned ? "Unpin" : "Pin"}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleArchive(chat.id, !!chat.is_archived); }}
              className="p-1 rounded hover:bg-sidebar-accent"
              title={chat.is_archived ? "Unarchive" : "Archive"}
              aria-label={chat.is_archived ? "Unarchive" : "Archive"}
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(chat.id, chat.title); }}
              className="p-1 rounded hover:bg-sidebar-accent text-destructive"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onRename(chat.id, chat.title)}>
          <Pencil className="mr-2 h-4 w-4" />
          {t("rename")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onTogglePin(chat.id, !!chat.is_pinned)}>
          <Pin className="mr-2 h-4 w-4" />
          {chat.is_pinned ? t("unpin") : t("pin")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onToggleArchive(chat.id, !!chat.is_archived)}>
          <Archive className="mr-2 h-4 w-4" />
          {chat.is_archived ? t("unarchive") : t("archive")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(chat.id, chat.title)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
