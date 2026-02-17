"use client";

import dynamic from "next/dynamic";
import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels";
import { FileExplorer } from "./file-explorer/file-explorer";
import { EditorPane } from "./editor/editor-pane";
import type { TerminalHandle } from "./terminal/terminal-pane";
import { WorkspaceToolbar } from "./workspace-toolbar";
import { MobileIdeTabs, type MobileIdeTab } from "./mobile-ide-tabs";
import { PanelErrorBoundary } from "./panel-error-boundary";
import { PanelSheets, type OverlayPanel } from "./panel-sheets";

// Loading fallback for lazy-loaded panels
import { Loader2 } from "lucide-react";
const PanelSkeleton = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

// Lazy-loaded panels (only loaded when their tab is opened)
const TerminalPane = dynamic(() => import("./terminal/terminal-pane").then(m => m.TerminalPane), { ssr: false, loading: PanelSkeleton });
const PreviewPane = dynamic(() => import("./preview/preview-pane").then(m => m.PreviewPane), { ssr: false, loading: PanelSkeleton });
const ChatPanel = dynamic(() => import("./chat-panel/chat-panel").then(m => m.ChatPanel), { ssr: false, loading: PanelSkeleton });
const ImageGenPanel = dynamic(() => import("./image-gen/image-gen-panel").then(m => m.ImageGenPanel), { ssr: false, loading: PanelSkeleton });
const ToolsPanel = dynamic(() => import("./tools/tools-panel").then(m => m.ToolsPanel), { ssr: false, loading: PanelSkeleton });
const ResourcesPanel = dynamic(() => import("./resources/resources-panel").then(m => m.ResourcesPanel), { ssr: false, loading: PanelSkeleton });
const EventsPanel = dynamic(() => import("./events/events-panel").then(m => m.EventsPanel), { ssr: false, loading: PanelSkeleton });
const DrupalPanel = dynamic(() => import("./drupal/drupal-panel").then(m => m.DrupalPanel), { ssr: false, loading: PanelSkeleton });
const KBPanel = dynamic(() => import("./kb/kb-panel").then(m => m.KBPanel), { ssr: false, loading: PanelSkeleton });
const SnapshotsPanel = dynamic(() => import("./snapshots/snapshots-panel").then(m => m.SnapshotsPanel), { ssr: false, loading: PanelSkeleton });
const ContextEditorPanel = dynamic(() => import("../context/context-editor-panel").then(m => m.ContextEditorPanel), { ssr: false, loading: PanelSkeleton });
const UIBuilderPanel = dynamic(() => import("./ui-builder/ui-builder-panel").then(m => m.UIBuilderPanel), { ssr: false, loading: PanelSkeleton });
const PlanningPanel = dynamic(() => import("./planning/planning-panel").then(m => m.PlanningPanel), { ssr: false, loading: PanelSkeleton });
const KBBuilderPanel = dynamic(() => import("./kb-builder/kb-builder-panel").then(m => m.KBBuilderPanel), { ssr: false, loading: PanelSkeleton });

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  useBreakpoint,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "@workstation/ui";
import { useFileExplorer, useAutomationActions, useTools } from "@workstation/api/hooks";
import { getClient } from "@workstation/api";
import type { ToolExecuteResponse } from "@workstation/api/types";

interface IDELayoutProps {
  projectId: string;
}

export function IDELayout({ projectId }: IDELayoutProps) {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<OverlayPanel>(null);
  const [showChat, setShowChat] = useState(false); // Chat is inline, not an overlay
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [toolsContext, setToolsContext] = useState<{
    prefillFile: string | null;
    filterForFile: boolean;
    initialTool: string | null;
  }>({ prefillFile: null, filterForFile: false, initialTool: null });
  const [lastToolExecution, setLastToolExecution] = useState<{
    toolName: string;
    success: boolean;
    timestamp: number;
    params: Record<string, unknown>;
  } | null>(null);
  const [rerunExecution, setRerunExecution] = useState<{
    toolName: string;
    params: Record<string, unknown>;
    timestamp: number;
  } | null>(null);
  const [toolResultsForChat, setToolResultsForChat] = useState<ToolExecuteResponse[]>([]);
  const [mobileTab, setMobileTab] = useState<MobileIdeTab>("editor");
  const { isMobile } = useBreakpoint();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const terminalRef = useRef<TerminalHandle | null>(null);

  const {
    fileTree,
    loading,
    error,
    refreshTree,
    createFile,
    createDirectory,
    deleteFile,
    renameFile,
  } = useFileExplorer(projectId);

  const { pendingCount } = useAutomationActions(projectId);
  const { tools, loading: toolsLoading, error: toolsError, executeTool, refresh: refreshTools } = useTools();

  // Read pinned tools once on mount, not on every render
  const [pinnedToolNames, setPinnedToolNames] = useState<string[]>([]);
  useEffect(() => {
    try {
      const pinned = JSON.parse(localStorage.getItem("tools:pinned") ?? "[]") as string[];
      setPinnedToolNames(pinned);
    } catch { /* ignore */ }
  }, []);

  const handleTerminalCommand = useCallback((cmd: string) => {
    setTerminalHistory((prev) => [...prev.slice(-49), cmd]);
  }, []);

  // Toolbar handlers
  const handleFilesClick = useCallback(() => {
    if (isMobile) {
      setMobileTab("files");
    } else {
      refreshTree();
    }
  }, [isMobile, refreshTree]);

  const handleRunClick = useCallback(() => {
    if (isMobile) {
      setMobileTab("terminal");
    }
    terminalRef.current?.runCommand("npm start");
  }, [isMobile]);

  const handleChatClick = useCallback(() => {
    if (isMobile) {
      setMobileTab("chat");
    } else {
      setShowChat((prev) => !prev);
    }
  }, [isMobile]);

  const togglePanel = useCallback((panel: NonNullable<typeof activePanel>, mobileTab?: MobileIdeTab) => {
    if (isMobile && mobileTab) {
      setMobileTab(mobileTab);
    } else {
      setActivePanel((p) => (p === panel ? null : panel));
    }
  }, [isMobile]);

  const handleActionsClick = useCallback(() => togglePanel("automations", "chat"), [togglePanel]);
  const handleHistoryClick = useCallback(() => togglePanel("history"), [togglePanel]);
  const handleImageGenClick = useCallback(() => togglePanel("image-gen", "image-gen"), [togglePanel]);
  const handleResourcesClick = useCallback(() => togglePanel("resources", "resources"), [togglePanel]);
  const handleEventsClick = useCallback(() => togglePanel("events", "events"), [togglePanel]);
  const handleDrupalClick = useCallback(() => togglePanel("drupal", "drupal"), [togglePanel]);
  const handleKBClick = useCallback(() => togglePanel("kb", "kb"), [togglePanel]);
  const handleSnapshotsClick = useCallback(() => togglePanel("snapshots", "snapshots"), [togglePanel]);
  const handleContextClick = useCallback(() => togglePanel("context", "context"), [togglePanel]);
  const handleUIBuilderClick = useCallback(() => togglePanel("ui-builder", "ui-builder"), [togglePanel]);
  const handlePlanningClick = useCallback(() => togglePanel("planning", "planning"), [togglePanel]);
  const handleKBBuilderClick = useCallback(() => togglePanel("kb-builder", "kb"), [togglePanel]);

  const handleToolsClick = useCallback(() => {
    setToolsContext({ prefillFile: null, filterForFile: false, initialTool: null });
    if (isMobile) {
      setMobileTab("tools");
    } else {
      setActivePanel((p) => (p === "tools" ? null : "tools"));
    }
  }, [isMobile]);

  const handleRunToolOnFile = useCallback(
    (filePath: string) => {
      setToolsContext({ prefillFile: filePath, filterForFile: true, initialTool: null });
      if (isMobile) {
        setMobileTab("tools");
      } else {
        setActivePanel("tools");
      }
    },
    [isMobile]
  );

  const handleToolExecuted = useCallback(
    (result: ToolExecuteResponse, toolName: string, params: Record<string, unknown>) => {
      const execution = {
        toolName,
        success: result.success,
        timestamp: Date.now(),
        params,
      };
      setLastToolExecution(execution);
      setToolResultsForChat((prev) => [result, ...prev.slice(0, 9)]);
      // Persist for status bar (which reads from localStorage)
      try {
        localStorage.setItem(
          "tools:last-execution",
          JSON.stringify({ toolName, success: result.success, timestamp: execution.timestamp })
        );
      } catch { /* ignore */ }
    },
    []
  );

  const handleRerunLastTool = useCallback(async () => {
    if (!lastToolExecution) return;
    setActivePanel("tools");
    setRerunExecution({
      toolName: lastToolExecution.toolName,
      params: lastToolExecution.params,
      timestamp: Date.now(),
    });
  }, [lastToolExecution]);

  const handleSettingsClick = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleCloseProject = useCallback(async () => {
    setClosing(true);
    try {
      await getClient().stopSandbox(projectId);
    } catch {
      // Container may not be running — that's fine
    }
    setShowCloseConfirm(false);
    router.push("/chat");
  }, [projectId, router]);

  const handleQuickExecuteTool = useCallback((toolName: string) => {
    setToolsContext({ prefillFile: null, filterForFile: false, initialTool: toolName });
    if (isMobile) {
      setMobileTab("tools");
    } else {
      setActivePanel("tools");
    }
  }, [isMobile]);

  const handleConfirmClose = useCallback(() => {
    setShowCloseConfirm(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+T — open quick execute (tools panel)
      if (mod && !e.shiftKey && e.key === "t") {
        e.preventDefault();
        if (isMobile) {
          setMobileTab("tools");
        } else {
          setActivePanel("tools");
        }
        return;
      }

      // Cmd/Ctrl+Shift+T — open tools page (same panel, "all" tab focus)
      if (mod && e.shiftKey && e.key === "T") {
        e.preventDefault();
        setToolsContext({ prefillFile: null, filterForFile: false, initialTool: null });
        if (isMobile) {
          setMobileTab("tools");
        } else {
          setActivePanel("tools");
        }
        return;
      }

      // Cmd/Ctrl+; — re-run last tool
      if (mod && e.key === ";") {
        e.preventDefault();
        if (lastToolExecution) {
          handleRerunLastTool();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, lastToolExecution, handleRerunLastTool]);

  const fileExplorerProps = {
    projectId,
    fileTree,
    loading,
    error,
    selectedFile,
    onSelect: setSelectedFile,
    onRefresh: refreshTree,
    onCreateFile: createFile,
    onCreateDirectory: createDirectory,
    onDelete: deleteFile,
    onRename: renameFile,
    onRunToolOnFile: handleRunToolOnFile,
  };

  const editorProps = {
    projectId,
    selectedFile,
  };

  const handleShowActions = useCallback(() => {
    setActivePanel("automations");
  }, []);

  const chatPanelProps = {
    projectId,
    selectedFile,
    fileTree,
    terminalHistory,
    onShowActions: handleShowActions,
  };

  if (isMobile) {
    return (
      <div className="flex h-full flex-col pb-14">
        <WorkspaceToolbar
          onFilesClick={handleFilesClick}
          onRunClick={handleRunClick}
          onChatClick={handleChatClick}
          onActionsClick={handleActionsClick}
          onImageGenClick={handleImageGenClick}
          onResourcesClick={handleResourcesClick}
          onEventsClick={handleEventsClick}
          onDrupalClick={handleDrupalClick}
          onKBClick={handleKBClick}
          onSnapshotsClick={handleSnapshotsClick}
          onContextClick={handleContextClick}
          onUIBuilderClick={handleUIBuilderClick}
          onPlanningClick={handlePlanningClick}
          onKBBuilderClick={handleKBBuilderClick}
          onToolsClick={handleToolsClick}
          onCloseProject={handleConfirmClose}
          onSettingsClick={handleSettingsClick}
          pendingActionsCount={pendingCount}
          toolsCount={tools.length}
          pinnedTools={tools.filter((t) => pinnedToolNames.includes(t.name))}
          onQuickExecuteTool={handleQuickExecuteTool}
        />
        <div className="flex-1 overflow-hidden">
          {mobileTab === "files" && <FileExplorer {...fileExplorerProps} />}
          {mobileTab === "editor" && <EditorPane {...editorProps} />}
          {mobileTab === "terminal" && (
            <TerminalPane
              projectId={projectId}
              onCommand={handleTerminalCommand}
              handleRef={terminalRef}
            />
          )}
          {mobileTab === "preview" && <PreviewPane />}
          {mobileTab === "chat" && (
            <ChatPanel
              {...chatPanelProps}
              toolResults={toolResultsForChat}
              onClose={() => setMobileTab("editor")}
            />
          )}
          {mobileTab === "image-gen" && (
            <ImageGenPanel
              projectId={projectId}
              onClose={() => setMobileTab("editor")}
            />
          )}
          {mobileTab === "tools" && (
            <ToolsPanel
              tools={tools}
              loading={toolsLoading}
              error={toolsError}
              onExecute={executeTool}
              onRefresh={refreshTools}
              onClose={() => setMobileTab("editor")}
              prefillFile={toolsContext.prefillFile}
              filterForFile={toolsContext.filterForFile}
              onToolExecuted={handleToolExecuted}
              rerunExecution={rerunExecution}
              initialTool={toolsContext.initialTool}
            />
          )}
          {mobileTab === "events" && (
            <EventsPanel onClose={() => setMobileTab("editor")} />
          )}
          {mobileTab === "resources" && (
            <ResourcesPanel onClose={() => setMobileTab("editor")} />
          )}
          {mobileTab === "drupal" && (
            <DrupalPanel
              projectId={projectId}
              onClose={() => setMobileTab("editor")}
            />
          )}
          {mobileTab === "kb" && (
            <KBPanel
              projectId={projectId}
              onClose={() => setMobileTab("editor")}
            />
          )}
          {mobileTab === "snapshots" && (
            <SnapshotsPanel
              projectId={projectId}
              onClose={() => setMobileTab("editor")}
            />
          )}
          {mobileTab === "context" && (
            <ContextEditorPanel
              projectId={projectId}
              onClose={() => setMobileTab("editor")}
            />
          )}
          {mobileTab === "ui-builder" && (
            <UIBuilderPanel
              onClose={() => setMobileTab("editor")}
            />
          )}
          {mobileTab === "planning" && (
            <PlanningPanel
              projectId={projectId}
              onClose={() => setMobileTab("editor")}
            />
          )}
          {mobileTab === "kb" && (
            <KBBuilderPanel
              projectId={projectId}
              onClose={() => setMobileTab("editor")}
            />
          )}
        </div>
        <MobileIdeTabs activeTab={mobileTab} onTabChange={setMobileTab} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <WorkspaceToolbar
        onFilesClick={handleFilesClick}
        onRunClick={handleRunClick}
        onChatClick={handleChatClick}
        onActionsClick={handleActionsClick}
        onHistoryClick={handleHistoryClick}
        onImageGenClick={handleImageGenClick}
        onResourcesClick={handleResourcesClick}
        onEventsClick={handleEventsClick}
        onDrupalClick={handleDrupalClick}
        onKBClick={handleKBClick}
        onSnapshotsClick={handleSnapshotsClick}
        onContextClick={handleContextClick}
        onUIBuilderClick={handleUIBuilderClick}
        onPlanningClick={handlePlanningClick}
        onKBBuilderClick={handleKBBuilderClick}
        onToolsClick={handleToolsClick}
        onCloseProject={handleConfirmClose}
        onSettingsClick={handleSettingsClick}
        pendingActionsCount={pendingCount}
        toolsCount={tools.length}
        pinnedTools={tools.filter((t) => pinnedToolNames.includes(t.name))}
        onQuickExecuteTool={handleQuickExecuteTool}
      />
      <Group orientation="horizontal" id="ide-main" className="flex-1">
        {/* File Explorer */}
        <Panel id="file-explorer" defaultSize="15%" minSize="10%" maxSize="30%">
          <PanelErrorBoundary panelName="File Explorer">
            <FileExplorer {...fileExplorerProps} />
          </PanelErrorBoundary>
        </Panel>

        <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

        {/* Main Editor + Terminal */}
        <Panel id="editor-main" defaultSize={showChat ? "55%" : "85%"} minSize="30%">
          <Group orientation="vertical" id="editor-vertical">
            {/* Editor Area */}
            <Panel id="editor-area" defaultSize="65%" minSize="30%">
              <PanelErrorBoundary panelName="Editor">
                <EditorPane {...editorProps} />
              </PanelErrorBoundary>
            </Panel>

            <Separator className="h-1 bg-border hover:bg-primary/50 transition-colors" />

            {/* Terminal + Preview */}
            <Panel id="terminal-preview" defaultSize="35%" minSize="15%">
              <Group orientation="horizontal" id="terminal-horizontal">
                <Panel id="terminal" defaultSize="60%" minSize="30%">
                  <PanelErrorBoundary panelName="Terminal">
                    <TerminalPane
                      projectId={projectId}
                      onCommand={handleTerminalCommand}
                      handleRef={terminalRef}
                    />
                  </PanelErrorBoundary>
                </Panel>
                <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
                <Panel id="preview" defaultSize="40%" minSize="20%">
                  <PanelErrorBoundary panelName="Preview">
                    <PreviewPane />
                  </PanelErrorBoundary>
                </Panel>
              </Group>
            </Panel>
          </Group>
        </Panel>

        {/* Chat Panel (collapsible sidebar — stays inline) */}
        {showChat && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel id="chat-panel" defaultSize="30%" minSize="20%" maxSize="40%">
              <PanelErrorBoundary panelName="Chat">
                <ChatPanel
                  {...chatPanelProps}
                  toolResults={toolResultsForChat}
                  onClose={() => setShowChat(false)}
                />
              </PanelErrorBoundary>
            </Panel>
          </>
        )}
      </Group>

      {/* Sheet overlays */}
      <PanelSheets
        projectId={projectId}
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        tools={tools}
        toolsLoading={toolsLoading}
        toolsError={toolsError}
        executeTool={executeTool}
        refreshTools={refreshTools}
        toolsPrefillFile={toolsContext.prefillFile}
        toolsFilterForFile={toolsContext.filterForFile}
        toolsRerunExecution={rerunExecution}
        toolsInitialTool={toolsContext.initialTool}
        onToolExecuted={handleToolExecuted}
      />

      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Project</DialogTitle>
            <DialogDescription>
              This will stop the sandbox container and disconnect any active
              terminal sessions. Unsaved editor changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCloseConfirm(false)}
              disabled={closing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleCloseProject}
              disabled={closing}
            >
              {closing ? "Closing..." : "Close Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
