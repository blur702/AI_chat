"use client";

import { useParams } from "next/navigation";
import { useEffect, useCallback, useState } from "react";
import { Button } from "@workstation/ui";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { TokenUsageBar } from "@/components/chat/token-usage-bar";
import { ContextDashboard } from "@/components/context/context-dashboard";
import { ContextEditor } from "@/components/context/context-editor";
import { useConversation } from "@workstation/api";
import { ACTIVE_MODEL_KEY, ACTIVE_MODEL_CHANGE_EVENT } from "@workstation/api/hooks";
import { PanelRightOpen, PanelRightClose } from "lucide-react";

const DASHBOARD_KEY = "workstation_context_dashboard_open";
const SIDEBAR_VIEW_KEY = "workstation_sidebar_view";

type SidebarView = "dashboard" | "editor";

export default function ChatPage() {
  const params = useParams();
  const rawChatId = params.chatId;
  const chatId = Array.isArray(rawChatId) ? rawChatId[0] : rawChatId ?? "";

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

  const {
    conversation,
    messages,
    loading,
    processing,
    progress,
    tokenUsage,
    sendMessage,
    cancelStream,
    pinMessage,
    excludeMessage,
    updateMessage,
    deleteMessage,
  } = useConversation(chatId, activeModel);

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
          <h1 className="text-sm font-medium">Chat {chatId}</h1>
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
        <TokenUsageBar tokenUsage={tokenUsage} />
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
            {sidebarView === "dashboard" ? (
              <ContextDashboard
                chatId={chatId}
                compactions={conversation?.compactions}
                messageCount={messages.length}
                chatInstructions={conversation?.chat_instructions}
                systemPromptId={conversation?.system_prompt_id}
              />
            ) : (
              <ContextEditor
                chatId={chatId}
                compactions={conversation?.compactions}
                messageCount={messages.length}
                chatInstructions={conversation?.chat_instructions}
                systemPromptId={conversation?.system_prompt_id}
                activeModel={activeModel}
                onClose={() => switchView("dashboard")}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
