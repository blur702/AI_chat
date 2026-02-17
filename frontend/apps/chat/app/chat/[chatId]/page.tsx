"use client";

import { useParams } from "next/navigation";
import { useEffect, useCallback, useState, useMemo } from "react";
import { Button } from "@workstation/ui";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { TokenUsageBar } from "@/components/chat/token-usage-bar";
import { ContextDashboard } from "@/components/context/context-dashboard";
import { ContextEditor } from "@/components/context/context-editor";
import { useConversation } from "@workstation/api";
import type { DraftOptions } from "@workstation/api/hooks";
import { ACTIVE_MODEL_KEY, ACTIVE_MODEL_CHANGE_EVENT, useChatMode } from "@workstation/api/hooks";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { ChatModeSelector } from "@/components/chat-mode-selector";
import { ToolCallDisplay } from "@/components/workspace/tools/tool-call-display";

const DASHBOARD_KEY = "workstation_context_dashboard_open";
const SIDEBAR_VIEW_KEY = "workstation_sidebar_view";

type SidebarView = "dashboard" | "editor";

export default function ChatPage() {
  const params = useParams();
  const rawChatId = params.chatId;
  const chatId = Array.isArray(rawChatId) ? rawChatId[0] : rawChatId ?? "";

  const isNewChat = chatId === "new";

  const [projectId] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("workstation_chat_project_id");
  });

  const [activeModel, setActiveModel] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_MODEL_KEY);
  });

  // Listen for model changes from the ModelSelectorDialog
  useEffect(() => {
    const handler = (e: Event) => {
      const model = (e as CustomEvent).detail?.model ?? null;
      setActiveModel(model);
    };
    window.addEventListener(ACTIVE_MODEL_CHANGE_EVENT, handler);
    return () => window.removeEventListener(ACTIVE_MODEL_CHANGE_EVENT, handler);
  }, []);

  const handleChatCreated = useCallback((newId: string, title?: string) => {
    window.history.replaceState(null, "", `/chat/${newId}`);
    window.dispatchEvent(
      new CustomEvent("chat-list-refresh", { detail: { chatId: newId, title } })
    );
  }, []);

  const draftOptions: DraftOptions | undefined = useMemo(
    () => (isNewChat ? { projectId, onChatCreated: handleChatCreated } : undefined),
    [isNewChat, projectId, handleChatCreated],
  );

  const { chatMode, setChatMode, syncFromServer } = useChatMode(
    isNewChat ? null : chatId,
  );

  const {
    conversation,
    messages,
    loading,
    processing,
    progress,
    tokenUsage,
    activeToolCalls,
    pendingApproval,
    approveToolCall,
    denyToolCall,
    sendMessage,
    cancelStream,
    pinMessage,
    excludeMessage,
    updateMessage,
    deleteMessage,
  } = useConversation(isNewChat ? null : chatId, activeModel, draftOptions, chatMode);

  // Sync chat mode from conversation state when loaded
  useEffect(() => {
    if (conversation?.chat_mode) {
      syncFromServer(conversation.chat_mode);
    }
  }, [conversation?.chat_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [dashboardOpen, setDashboardOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DASHBOARD_KEY) === "true";
  });

  const [sidebarView, setSidebarView] = useState<SidebarView>(() => {
    if (typeof window === "undefined") return "dashboard";
    return (localStorage.getItem(SIDEBAR_VIEW_KEY) as SidebarView) || "dashboard";
  });

  const toggleDashboard = () => {
    setDashboardOpen((prev) => {
      const next = !prev;
      localStorage.setItem(DASHBOARD_KEY, String(next));
      return next;
    });
  };

  const switchView = (view: SidebarView) => {
    setSidebarView(view);
    try {
      localStorage.setItem(SIDEBAR_VIEW_KEY, view);
    } catch { /* ignore */ }
  };

  // Global Escape key listener to stop streaming even when textarea isn't focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && processing) {
        cancelStream();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [processing, cancelStream]);

  const handleEdit = useCallback(
    (messageId: string, content: string) => {
      updateMessage(messageId, { content });
    },
    [updateMessage]
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-sm font-medium">
            {isNewChat ? "New Chat" : (conversation?.title ?? `Chat ${chatId.slice(0, 8)}`)}
          </h1>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={toggleDashboard}
            title={dashboardOpen ? "Close sidebar" : "Open sidebar"}
          >
            {dashboardOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>
        <MessageThread
          messages={messages}
          compactions={conversation?.compactions}
          loading={loading}
          processing={processing}
          progress={progress}
          onPin={pinMessage}
          onExclude={excludeMessage}
          onEdit={handleEdit}
          onDelete={deleteMessage}
        />
        {activeToolCalls.length > 0 && (
          <ToolCallDisplay
            toolCalls={activeToolCalls}
            pendingApproval={pendingApproval}
            onApprove={approveToolCall}
            onDeny={denyToolCall}
          />
        )}
        <TokenUsageBar tokenUsage={tokenUsage} />
        <ChatModeSelector
          activeMode={chatMode}
          onModeChange={setChatMode}
          disabled={processing}
        />
        <MessageInput onSend={sendMessage} processing={processing} onStop={cancelStream} />
      </div>

      {/* Sidebar */}
      {dashboardOpen && (
        <div className="w-80 shrink-0 border-l bg-background overflow-hidden flex flex-col">
          {/* View toggle tabs */}
          <div className="flex border-b">
            <button
              onClick={() => switchView("dashboard")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                sidebarView === "dashboard"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => switchView("editor")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                sidebarView === "editor"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Context Editor
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {conversation?.chat_id ? (
              sidebarView === "dashboard" ? (
                <ContextDashboard
                  chatId={conversation.chat_id}
                  compactions={conversation.compactions}
                  messageCount={messages.length}
                  chatInstructions={conversation.chat_instructions}
                  systemPromptId={conversation.system_prompt_id}
                />
              ) : (
                <ContextEditor
                  chatId={conversation.chat_id}
                  compactions={conversation.compactions}
                  messageCount={messages.length}
                  chatInstructions={conversation.chat_instructions}
                  systemPromptId={conversation.system_prompt_id}
                  activeModel={activeModel}
                  onClose={() => switchView("dashboard")}
                />
              )
            ) : (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                Send a message to start
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
