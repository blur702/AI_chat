"use client";

import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { FileExplorer } from "./file-explorer/file-explorer";
import { EditorPane } from "./editor/editor-pane";
import { TerminalPane } from "./terminal/terminal-pane";
import { PreviewPane } from "./preview/preview-pane";
import { ChatPanel } from "./chat-panel/chat-panel";
import { MobileIdeTabs, type MobileIdeTab } from "./mobile-ide-tabs";
import { useState } from "react";
import { useBreakpoint } from "@workstation/ui";

interface IDELayoutProps {
  projectId: string;
}

export function IDELayout({ projectId }: IDELayoutProps) {
  const [showChat, setShowChat] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileIdeTab>("editor");
  const { isMobile } = useBreakpoint();

  if (isMobile) {
    return (
      <div className="flex h-full flex-col pb-14">
        <div className="flex-1 overflow-hidden">
          {mobileTab === "files" && <FileExplorer />}
          {mobileTab === "editor" && <EditorPane />}
          {mobileTab === "terminal" && <TerminalPane />}
          {mobileTab === "preview" && <PreviewPane />}
          {mobileTab === "chat" && (
            <ChatPanel onClose={() => setMobileTab("editor")} />
          )}
        </div>
        <MobileIdeTabs activeTab={mobileTab} onTabChange={setMobileTab} />
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" className="h-full">
      {/* File Explorer */}
      <Panel defaultSize={15} minSize={10} maxSize={30}>
        <FileExplorer />
      </Panel>

      <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

      {/* Main Editor + Terminal */}
      <Panel defaultSize={showChat ? 55 : 85} minSize={30} key={showChat ? "with-chat" : "no-chat"}>
        <PanelGroup direction="vertical">
          {/* Editor Area */}
          <Panel defaultSize={65} minSize={30}>
            <EditorPane />
          </Panel>

          <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />

          {/* Terminal + Preview */}
          <Panel defaultSize={35} minSize={15}>
            <PanelGroup direction="horizontal">
              <Panel defaultSize={60} minSize={30}>
                <TerminalPane />
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
            <ChatPanel onClose={() => setShowChat(false)} />
          </Panel>
        </>
      )}

      {/* Chat toggle if closed */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          className="flex items-center justify-center min-w-[44px] w-11 border-l bg-muted/30 hover:bg-muted transition-colors"
          title="Open AI Chat"
        >
          <span className="text-xs [writing-mode:vertical-lr] text-muted-foreground">
            AI Chat
          </span>
        </button>
      )}
    </PanelGroup>
  );
}
