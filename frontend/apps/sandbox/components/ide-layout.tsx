"use client";

import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { FileExplorer } from "./file-explorer/file-explorer";
import { EditorPane } from "./editor/editor-pane";
import { TerminalPane, type TerminalHandle } from "./terminal/terminal-pane";
import { PreviewPane } from "./preview/preview-pane";
import { ChatPanel } from "./chat-panel/chat-panel";
import { AutomationActionsPanel } from "./automation-actions-panel";
import { YoloEditHistory } from "./yolo-edit-history";
import { SandboxToolbar } from "./sandbox-toolbar";
import { MobileIdeTabs, type MobileIdeTab } from "./mobile-ide-tabs";
import { useState, useCallback, useRef } from "react";
import { useBreakpoint } from "@workstation/ui";
import { useFileExplorer, useAutomationActions } from "@workstation/api/hooks";

interface IDELayoutProps {
  projectId: string;
}

export function IDELayout({ projectId }: IDELayoutProps) {
  const [showChat, setShowChat] = useState(false);
  const [showAutomations, setShowAutomations] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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

  const handleSettingsClick = useCallback(() => {
    // Settings panel placeholder - can be expanded later
  }, []);

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
        <SandboxToolbar
          onFilesClick={handleFilesClick}
          onRunClick={handleRunClick}
          onChatClick={handleChatClick}
          onActionsClick={handleActionsClick}
          onSettingsClick={handleSettingsClick}
          pendingActionsCount={pendingCount}
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
      <SandboxToolbar
        onFilesClick={handleFilesClick}
        onRunClick={handleRunClick}
        onChatClick={handleChatClick}
        onActionsClick={handleActionsClick}
        onHistoryClick={handleHistoryClick}
        onSettingsClick={handleSettingsClick}
        pendingActionsCount={pendingCount}
      />
      <PanelGroup direction="horizontal" className="flex-1">
        {/* File Explorer */}
        <Panel defaultSize={15} minSize={10} maxSize={30}>
          <FileExplorer {...fileExplorerProps} />
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

        {/* Main Editor + Terminal */}
        <Panel defaultSize={showChat || showAutomations || showHistory ? 55 : 85} minSize={30}>
          <PanelGroup direction="vertical">
            {/* Editor Area */}
            <Panel defaultSize={65} minSize={30}>
              <EditorPane {...editorProps} />
            </Panel>

            <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />

            {/* Terminal + Preview */}
            <Panel defaultSize={35} minSize={15}>
              <PanelGroup direction="horizontal">
                <Panel defaultSize={60} minSize={30}>
                  <TerminalPane
                    projectId={projectId}
                    onCommand={handleTerminalCommand}
                    handleRef={terminalRef}
                  />
                </Panel>
                <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
                <Panel defaultSize={40} minSize={20}>
                  <PreviewPane />
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </Panel>

        {/* Chat Panel (collapsible) */}
        {showChat && (
          <>
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={30} minSize={20} maxSize={40}>
              <ChatPanel
                {...chatPanelProps}
                onClose={() => setShowChat(false)}
              />
            </Panel>
          </>
        )}

        {/* Automation Actions Panel (collapsible) */}
        {showAutomations && (
          <>
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
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
            <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={25} minSize={15} maxSize={35}>
              <YoloEditHistory
                projectId={projectId}
                onClose={() => setShowHistory(false)}
              />
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}
