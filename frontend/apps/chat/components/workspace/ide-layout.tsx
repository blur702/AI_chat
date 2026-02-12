"use client";

import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels";
import { FileExplorer } from "./file-explorer/file-explorer";
import { EditorPane } from "./editor/editor-pane";
import { TerminalPane, type TerminalHandle } from "./terminal/terminal-pane";
import { PreviewPane } from "./preview/preview-pane";
import { ChatPanel } from "./chat-panel/chat-panel";
import { AutomationActionsPanel } from "./automation-actions-panel";
import { YoloEditHistory } from "./yolo-edit-history";
import { ImageGenPanel } from "./image-gen/image-gen-panel";
import { ToolsPanel } from "./tools/tools-panel";
import { ResourcesPanel } from "./resources/resources-panel";
import { EventsPanel } from "./events/events-panel";
import { DrupalPanel } from "./drupal/drupal-panel";
import { WorkspaceToolbar } from "./workspace-toolbar";
import { MobileIdeTabs, type MobileIdeTab } from "./mobile-ide-tabs";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBreakpoint } from "@workstation/ui";
import { useFileExplorer, useAutomationActions, useTools } from "@workstation/api/hooks";
import type { ToolExecuteResponse } from "@workstation/api/types";

interface IDELayoutProps {
  projectId: string;
}

export function IDELayout({ projectId }: IDELayoutProps) {
  const router = useRouter();
  const [showChat, setShowChat] = useState(false);
  const [showAutomations, setShowAutomations] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [showDrupal, setShowDrupal] = useState(false);
  const [toolsPrefillFile, setToolsPrefillFile] = useState<string | null>(null);
  const [toolsFilterForFile, setToolsFilterForFile] = useState(false);
  const [initialTool, setInitialTool] = useState<string | null>(null);
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

  const handleActionsClick = useCallback(() => {
    if (isMobile) {
      setMobileTab("chat");
    } else {
      setShowAutomations((prev) => !prev);
    }
  }, [isMobile]);

  const handleHistoryClick = useCallback(() => {
    setShowHistory((prev) => !prev);
  }, []);

  const handleImageGenClick = useCallback(() => {
    if (isMobile) {
      setMobileTab("image-gen");
    } else {
      setShowImageGen((prev) => !prev);
    }
  }, [isMobile]);

  const handleResourcesClick = useCallback(() => {
    if (isMobile) {
      setMobileTab("resources");
    } else {
      setShowResources((prev) => !prev);
    }
  }, [isMobile]);

  const handleEventsClick = useCallback(() => {
    if (isMobile) {
      setMobileTab("events");
    } else {
      setShowEvents((prev) => !prev);
    }
  }, [isMobile]);

  const handleDrupalClick = useCallback(() => {
    if (isMobile) {
      setMobileTab("drupal");
    } else {
      setShowDrupal((prev) => !prev);
    }
  }, [isMobile]);

  const handleToolsClick = useCallback(() => {
    setToolsPrefillFile(null);
    setToolsFilterForFile(false);
    setInitialTool(null);
    if (isMobile) {
      setMobileTab("tools");
    } else {
      setShowTools((prev) => !prev);
    }
  }, [isMobile]);

  const handleRunToolOnFile = useCallback(
    (filePath: string) => {
      setToolsPrefillFile(filePath);
      setToolsFilterForFile(true);
      setInitialTool(null);
      if (isMobile) {
        setMobileTab("tools");
      } else {
        setShowTools(true);
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
    setShowTools(true);
    setRerunExecution({
      toolName: lastToolExecution.toolName,
      params: lastToolExecution.params,
      timestamp: Date.now(),
    });
  }, [lastToolExecution]);

  const handleSettingsClick = useCallback(() => {
    router.push("/settings");
  }, [router]);

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
          setShowTools(true);
        }
        return;
      }

      // Cmd/Ctrl+Shift+T — open tools page (same panel, "all" tab focus)
      if (mod && e.shiftKey && e.key === "T") {
        e.preventDefault();
        setToolsPrefillFile(null);
        setToolsFilterForFile(false);
        setInitialTool(null);
        if (isMobile) {
          setMobileTab("tools");
        } else {
          setShowTools(true);
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
    setShowAutomations(true);
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
          onToolsClick={handleToolsClick}
          onSettingsClick={handleSettingsClick}
          pendingActionsCount={pendingCount}
          toolsCount={tools.length}
          pinnedTools={tools.filter((t) => {
            try {
              const pinned = JSON.parse(localStorage.getItem("tools:pinned") ?? "[]") as string[];
              return pinned.includes(t.name);
            } catch { return false; }
          })}
          onQuickExecuteTool={(toolName) => {
            setToolsPrefillFile(null);
            setToolsFilterForFile(false);
            setInitialTool(toolName);
            setMobileTab("tools");
          }}
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
              prefillFile={toolsPrefillFile}
              filterForFile={toolsFilterForFile}
              onToolExecuted={handleToolExecuted}
              rerunExecution={rerunExecution}
              initialTool={initialTool}
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
        onToolsClick={handleToolsClick}
        onSettingsClick={handleSettingsClick}
        pendingActionsCount={pendingCount}
        toolsCount={tools.length}
        pinnedTools={tools.filter((t) => {
          try {
            const pinned = JSON.parse(localStorage.getItem("tools:pinned") ?? "[]") as string[];
            return pinned.includes(t.name);
          } catch { return false; }
        })}
        onQuickExecuteTool={(toolName) => {
          setToolsPrefillFile(null);
          setToolsFilterForFile(false);
          setInitialTool(toolName);
          setShowTools(true);
        }}
      />
      <Group orientation="horizontal" className="flex-1">
        {/* File Explorer */}
        <Panel defaultSize={15} minSize={10} maxSize={30}>
          <FileExplorer {...fileExplorerProps} />
        </Panel>

        <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

        {/* Main Editor + Terminal */}
        <Panel defaultSize={showChat || showAutomations || showHistory || showImageGen || showTools || showEvents || showResources || showDrupal ? 55 : 85} minSize={30}>
          <Group orientation="vertical">
            {/* Editor Area */}
            <Panel defaultSize={65} minSize={30}>
              <EditorPane {...editorProps} />
            </Panel>

            <Separator className="h-1 bg-border hover:bg-primary/50 transition-colors" />

            {/* Terminal + Preview */}
            <Panel defaultSize={35} minSize={15}>
              <Group orientation="horizontal">
                <Panel defaultSize={60} minSize={30}>
                  <TerminalPane
                    projectId={projectId}
                    onCommand={handleTerminalCommand}
                    handleRef={terminalRef}
                  />
                </Panel>
                <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
                <Panel defaultSize={40} minSize={20}>
                  <PreviewPane />
                </Panel>
              </Group>
            </Panel>
          </Group>
        </Panel>

        {/* Chat Panel (collapsible) */}
        {showChat && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={30} minSize={20} maxSize={40}>
              <ChatPanel
                {...chatPanelProps}
                toolResults={toolResultsForChat}
                onClose={() => setShowChat(false)}
              />
            </Panel>
          </>
        )}

        {/* Automation Actions Panel (collapsible) */}
        {showAutomations && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={25} minSize={15} maxSize={35}>
              <AutomationActionsPanel
                projectId={projectId}
                onClose={() => setShowAutomations(false)}
              />
            </Panel>
          </>
        )}

        {/* Edit History Panel (collapsible) */}
        {showHistory && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={25} minSize={15} maxSize={35}>
              <YoloEditHistory
                projectId={projectId}
                onClose={() => setShowHistory(false)}
              />
            </Panel>
          </>
        )}

        {/* Image Generation Panel (collapsible) */}
        {showImageGen && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={30} minSize={20} maxSize={40}>
              <ImageGenPanel
                projectId={projectId}
                onClose={() => setShowImageGen(false)}
              />
            </Panel>
          </>
        )}

        {/* Tools Panel (collapsible) */}
        {showTools && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={30} minSize={20} maxSize={40}>
              <ToolsPanel
                tools={tools}
                loading={toolsLoading}
                error={toolsError}
                onExecute={executeTool}
                onRefresh={refreshTools}
                onClose={() => setShowTools(false)}
                prefillFile={toolsPrefillFile}
                filterForFile={toolsFilterForFile}
                onToolExecuted={handleToolExecuted}
                rerunExecution={rerunExecution}
                initialTool={initialTool}
              />
            </Panel>
          </>
        )}

        {/* Events Panel (collapsible) */}
        {showEvents && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={25} minSize={15} maxSize={35}>
              <EventsPanel onClose={() => setShowEvents(false)} />
            </Panel>
          </>
        )}

        {/* Resources Panel (collapsible) */}
        {showResources && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={25} minSize={15} maxSize={35}>
              <ResourcesPanel onClose={() => setShowResources(false)} />
            </Panel>
          </>
        )}

        {/* Drupal Panel (collapsible) */}
        {showDrupal && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={30} minSize={20} maxSize={40}>
              <DrupalPanel
                projectId={projectId}
                onClose={() => setShowDrupal(false)}
              />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}
