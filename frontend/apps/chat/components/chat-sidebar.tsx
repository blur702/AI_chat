"use client";

import { useState, useRef, useCallback } from "react";
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
  cn,
  useBreakpoint,
  useSwipe,
} from "@workstation/ui";
import { useChats } from "@workstation/api";
import { Plus, MessageSquare, Settings, Pin, Archive, Trash2, Pencil, Loader2 } from "lucide-react";

interface ChatSidebarProps {
  projectId: string | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function ChatSidebar({ projectId, mobileOpen: mobileOpenProp, onMobileClose: onMobileCloseProp }: ChatSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { chats, loading, error, createChat, updateChat, deleteChat } = useChats(projectId);
  const { isMobile } = useBreakpoint();
  const sidebarRef = useRef<HTMLElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const mobileOpen = mobileOpenProp ?? internalOpen;
  const onMobileClose = onMobileCloseProp ?? (() => setInternalOpen(false));

  const swipeHandlers = useSwipe(sidebarRef, {
    onSwipeLeft: () => onMobileClose(),
  });

  const handleChatSelect = () => {
    if (isMobile) onMobileClose();
  };

  const handleNewChat = useCallback(async () => {
    if (!projectId || creating) return;
    setCreating(true);
    setOperationError(null);
    try {
      const chatId = await createChat("New Chat");
      if (chatId) {
        router.push(`/chat/${chatId}`);
        if (isMobile) onMobileClose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to create chat:", err);
      setOperationError(`Failed to create chat: ${message}`);
    } finally {
      setCreating(false);
    }
  }, [projectId, creating, createChat, router, isMobile, onMobileClose]);

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

  const sidebarContent = (
    <SidebarContent
      chats={chats}
      pathname={pathname}
      loading={loading}
      creating={creating}
      error={error}
      operationError={operationError}
      onChatSelect={handleChatSelect}
      onNewChat={handleNewChat}
      onRename={(id, title) => {
        setRenameTarget({ id, title });
        setRenameValue(title);
      }}
      onDelete={(id, title) => setDeleteTarget({ id, title })}
      onTogglePin={handleTogglePin}
      onToggleArchive={handleToggleArchive}
    />
  );

  const dialogs = (
    <>
      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
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
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
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
  chats: { id: string; title: string; is_pinned?: boolean; is_archived?: boolean; created_at?: string; updated_at?: string }[];
  pathname: string;
  loading: boolean;
  creating: boolean;
  error: string | null;
  operationError: string | null;
  onChatSelect?: () => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string, currentlyPinned: boolean) => void;
  onToggleArchive: (id: string, currentlyArchived: boolean) => void;
}

function SidebarContent({
  chats,
  pathname,
  loading,
  creating,
  error,
  operationError,
  onChatSelect,
  onNewChat,
  onRename,
  onDelete,
  onTogglePin,
  onToggleArchive,
}: SidebarContentProps) {
  const pinnedChats = chats.filter((c) => c.is_pinned && !c.is_archived);
  const regularChats = chats.filter((c) => !c.is_pinned && !c.is_archived);
  const archivedChats = chats.filter((c) => c.is_archived);

  return (
    <>
      <div className="flex items-center justify-between p-4">
        <h2 className="text-sm font-semibold text-sidebar-foreground">Chats</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewChat}
          disabled={creating}
          aria-label="Create new chat"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        {loading && chats.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (error || operationError) ? (
          <p className="px-3 py-4 text-xs text-destructive">{operationError ?? error}</p>
        ) : chats.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            No chats yet. Click + to create one.
          </p>
        ) : (
          <div className="space-y-1" role="list" aria-label="Chat list">
            {pinnedChats.length > 0 && (
              <>
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Pinned</p>
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
                  <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Recent</p>
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
                <p className="px-3 py-1 pt-2 text-xs font-medium text-muted-foreground">Archived</p>
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

      <div className="border-t p-2 mt-2">
        <Link
          href="/settings"
          onClick={onChatSelect}
          className="flex w-full items-center justify-start gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">Settings</span>
        </Link>
      </div>
    </>
  );
}

function ChatItem({
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
        <Link
          href={`/chat/${chat.id}`}
          role="listitem"
          aria-current={isActive ? "page" : undefined}
          onClick={onSelect}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{chat.title}</span>
          {chat.is_pinned && <Pin className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" aria-label="Pinned" />}
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onRename(chat.id, chat.title)}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onTogglePin(chat.id, !!chat.is_pinned)}>
          <Pin className="mr-2 h-4 w-4" />
          {chat.is_pinned ? "Unpin" : "Pin"}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onToggleArchive(chat.id, !!chat.is_archived)}>
          <Archive className="mr-2 h-4 w-4" />
          {chat.is_archived ? "Unarchive" : "Archive"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(chat.id, chat.title)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
