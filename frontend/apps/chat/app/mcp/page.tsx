"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@workstation/ui";
import { MessageThread } from "@/components/message-thread";
import { MessageInput } from "@/components/message-input";
import { TokenUsageBar } from "@/components/chat/token-usage-bar";
import { ContextDashboard } from "@/components/context/context-dashboard";
import { ContextEditor } from "@/components/context/context-editor";
import { ChatModeSelector } from "@/components/chat-mode-selector";
import { ToolCallDisplay } from "@/components/workspace/tools/tool-call-display";
import { StagingControls } from "@/components/drupal/staging-controls";
import { PreviewPane } from "@/components/workspace/preview/preview-pane";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { useConversation, useAuth } from "@workstation/api";
import {
  useChatMode,
  useDrupal,
  ACTIVE_MODEL_KEY,
  ACTIVE_MODEL_CHANGE_EVENT as MODE_EVENT,
} from "@workstation/api/hooks";
import { useProjectId } from "@/app/hooks/use-project-id";

const SIDEBAR_VIEW_KEY = "workstation_sidebar_view";

type SidebarView = "dashboard" | "editor";

const DEFAULT_PREVIEW_URL = "http://localhost:9080";

export default function McpPage() {
  const projectId = useProjectId();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated || !projectId) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading MCP workspace...
      </div>
    );
  }

  return <McpWorkspace projectId={projectId} />;
}

function McpWorkspace({ projectId }: { projectId: string }) {
  const [activeModel, setActiveModel] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_MODEL_KEY);
  });
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarView>(() => {
    if (typeof window === "undefined") return "dashboard";
    return (localStorage.getItem(SIDEBAR_VIEW_KEY) as SidebarView) || "dashboard";
  });

  const handleChatCreated = useCallback(() => {
    // No-op; this workspace uses a single chat instance.
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const model = (e as CustomEvent).detail?.model ?? null;
      setActiveModel(model);
    };
    window.addEventListener(MODE_EVENT, handler);
    return () => window.removeEventListener(MODE_EVENT, handler);
  }, []);

  const draftOptions = useMemo(
    () => ({ projectId, onChatCreated: handleChatCreated }),
    [projectId, handleChatCreated],
  );

  const { chatMode, setChatMode, syncFromServer } = useChatMode(null);
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
  } = useConversation(null, activeModel, draftOptions, chatMode);

  useEffect(() => {
    if (conversation?.chat_mode) {
      syncFromServer(conversation.chat_mode);
    }
  }, [conversation?.chat_id, syncFromServer]);

  const toggleDashboard = useCallback(() => {
    setDashboardOpen((prev) => !prev);
  }, []);

  const switchView = useCallback((view: SidebarView) => {
    setSidebarView(view);
    try {
      localStorage.setItem(SIDEBAR_VIEW_KEY, view);
    } catch {
      // ignore write errors
    }
  }, []);

  const handleEdit = useCallback(
    (messageId: string, content: string) => {
      updateMessage(messageId, { content });
    },
    [updateMessage],
  );

  const drupal = useDrupal(projectId);
  const previewUrl = drupal.stagingStatus?.preview_url || DEFAULT_PREVIEW_URL;
  const previewKey = useMemo(() => previewUrl, [previewUrl]);

  const { refreshStaging } = drupal;
  useEffect(() => {
    const interval = setInterval(() => {
      refreshStaging();
    }, 20000);
    return () => clearInterval(interval);
  }, [refreshStaging]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-sm font-medium">MCP Chat</h1>
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

        <div className="min-h-0 flex-1 overflow-hidden">
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
        </div>

        {activeToolCalls.length > 0 && (
          <ToolCallDisplay
            toolCalls={activeToolCalls}
            pendingApproval={pendingApproval}
            onApprove={approveToolCall}
            onDeny={denyToolCall}
          />
        )}

        <TokenUsageBar tokenUsage={tokenUsage} />

        <ChatModeSelector activeMode={chatMode} onModeChange={setChatMode} disabled={processing} />

        <MessageInput onSend={sendMessage} processing={processing} onStop={cancelStream} />
      </div>

      {dashboardOpen && (
        <div className="flex w-80 shrink-0 flex-col overflow-hidden border-l bg-background">
          <div className="flex border-b">
            <button
              onClick={() => switchView("dashboard")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                sidebarView === "dashboard"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => switchView("editor")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                sidebarView === "editor"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Context Editor
            </button>
          </div>
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
              <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                Send a message to start
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex w-96 shrink-0 flex-col overflow-hidden border-l bg-slate-50">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Drupal Preview</span>
          <StagingControls
            stagingStatus={drupal.stagingStatus}
            stagingLoading={drupal.stagingLoading}
            cloning={drupal.cloning}
            pushing={drupal.pushing}
            stagingStarting={drupal.stagingStarting}
            stagingStopping={drupal.stagingStopping}
            onClone={drupal.cloneProduction}
            onPush={drupal.pushToProduction}
            onStart={drupal.startStaging}
            onStop={drupal.stopStaging}
            onRefresh={drupal.refreshStaging}
          />
        </div>

        {drupal.error && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {drupal.error}
          </div>
        )}

        <div className="min-h-0 flex-1">
          <PreviewPane key={previewKey} defaultUrl={previewUrl} />
        </div>
      </div>
    </div>
  );
}
