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
import { useState } from "react";

interface IDELayoutProps {
  projectId: string;
}

export function IDELayout({ projectId }: IDELayoutProps) {
  const [showChat, setShowChat] = useState(false);

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
          className="flex items-center justify-center w-8 border-l bg-muted/30 hover:bg-muted transition-colors"
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
