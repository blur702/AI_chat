"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@workstation/ui";
import { PanelErrorBoundary } from "./panel-error-boundary";
import type { ToolExecuteRequest, ToolExecuteResponse, ToolInfo } from "@workstation/api/types";

const PanelSkeleton = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

// Lazy-loaded panels
const AutomationActionsPanel = dynamic(() => import("./automation-actions-panel").then(m => m.AutomationActionsPanel), { ssr: false, loading: PanelSkeleton });
const YoloEditHistory = dynamic(() => import("./yolo-edit-history").then(m => m.YoloEditHistory), { ssr: false, loading: PanelSkeleton });
const ImageGenPanel = dynamic(() => import("./image-gen/image-gen-panel").then(m => m.ImageGenPanel), { ssr: false, loading: PanelSkeleton });
const ToolsPanel = dynamic(() => import("./tools/tools-panel").then(m => m.ToolsPanel), { ssr: false, loading: PanelSkeleton });
const EventsPanel = dynamic(() => import("./events/events-panel").then(m => m.EventsPanel), { ssr: false, loading: PanelSkeleton });
const ResourcesPanel = dynamic(() => import("./resources/resources-panel").then(m => m.ResourcesPanel), { ssr: false, loading: PanelSkeleton });
const DrupalPanel = dynamic(() => import("./drupal/drupal-panel").then(m => m.DrupalPanel), { ssr: false, loading: PanelSkeleton });
const KBPanel = dynamic(() => import("./kb/kb-panel").then(m => m.KBPanel), { ssr: false, loading: PanelSkeleton });
const SnapshotsPanel = dynamic(() => import("./snapshots/snapshots-panel").then(m => m.SnapshotsPanel), { ssr: false, loading: PanelSkeleton });
const ContextEditorPanel = dynamic(() => import("../context/context-editor-panel").then(m => m.ContextEditorPanel), { ssr: false, loading: PanelSkeleton });
const UIBuilderPanel = dynamic(() => import("./ui-builder/ui-builder-panel").then(m => m.UIBuilderPanel), { ssr: false, loading: PanelSkeleton });
const PlanningPanel = dynamic(() => import("./planning/planning-panel").then(m => m.PlanningPanel), { ssr: false, loading: PanelSkeleton });
const KBBuilderPanel = dynamic(() => import("./kb-builder/kb-builder-panel").then(m => m.KBBuilderPanel), { ssr: false, loading: PanelSkeleton });
const IssuesPanel = dynamic(() => import("./issues/issues-panel").then(m => m.IssuesPanel), { ssr: false, loading: PanelSkeleton });

export type OverlayPanel =
  | "automations" | "history" | "image-gen" | "tools"
  | "events" | "resources" | "drupal" | "kb" | "snapshots"
  | "context" | "ui-builder" | "planning" | "kb-builder"
  | "issues"
  | null;

interface PanelSheetsProps {
  projectId: string;
  activePanel: OverlayPanel;
  setActivePanel: (panel: OverlayPanel) => void;
  // Tools
  tools: ToolInfo[];
  toolsLoading: boolean;
  toolsError: string | null;
  executeTool: (request: ToolExecuteRequest) => Promise<ToolExecuteResponse>;
  refreshTools: () => Promise<void>;
  toolsPrefillFile: string | null;
  toolsFilterForFile: boolean;
  toolsRerunExecution: {
    toolName: string;
    params: Record<string, unknown>;
    timestamp: number;
  } | null;
  toolsInitialTool: string | null;
  onToolExecuted: (result: ToolExecuteResponse, toolName: string, params: Record<string, unknown>) => void;
}

function sheetOpenChange(panel: OverlayPanel, setActivePanel: (p: OverlayPanel) => void) {
  return (open: boolean) => setActivePanel(open ? panel : null);
}

export function PanelSheets({
  projectId,
  activePanel,
  setActivePanel,
  tools,
  toolsLoading,
  toolsError,
  executeTool,
  refreshTools,
  toolsPrefillFile,
  toolsFilterForFile,
  toolsRerunExecution,
  toolsInitialTool,
  onToolExecuted,
}: PanelSheetsProps) {
  const close = () => setActivePanel(null);

  return (
    <>
      <Sheet open={activePanel === "automations"} onOpenChange={sheetOpenChange("automations", setActivePanel)}>
        <SheetContent>
          <SheetTitle className="sr-only">Automation Actions</SheetTitle>
          <PanelErrorBoundary panelName="Automation Actions">
            <AutomationActionsPanel projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "history"} onOpenChange={sheetOpenChange("history", setActivePanel)}>
        <SheetContent>
          <SheetTitle className="sr-only">Edit History</SheetTitle>
          <PanelErrorBoundary panelName="Edit History">
            <YoloEditHistory projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "image-gen"} onOpenChange={sheetOpenChange("image-gen", setActivePanel)}>
        <SheetContent className="w-[520px]">
          <SheetTitle className="sr-only">Image Generation</SheetTitle>
          <PanelErrorBoundary panelName="Image Generation">
            <ImageGenPanel projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "tools"} onOpenChange={sheetOpenChange("tools", setActivePanel)}>
        <SheetContent className="w-[520px]">
          <SheetTitle className="sr-only">Tools</SheetTitle>
          <PanelErrorBoundary panelName="Tools">
            <ToolsPanel
              tools={tools}
              loading={toolsLoading}
              error={toolsError}
              onExecute={executeTool}
              onRefresh={refreshTools}
              onClose={close}
              prefillFile={toolsPrefillFile}
              filterForFile={toolsFilterForFile}
              onToolExecuted={onToolExecuted}
              rerunExecution={toolsRerunExecution}
              initialTool={toolsInitialTool}
            />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "events"} onOpenChange={sheetOpenChange("events", setActivePanel)}>
        <SheetContent>
          <SheetTitle className="sr-only">Events</SheetTitle>
          <PanelErrorBoundary panelName="Events">
            <EventsPanel onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "resources"} onOpenChange={sheetOpenChange("resources", setActivePanel)}>
        <SheetContent>
          <SheetTitle className="sr-only">Resources</SheetTitle>
          <PanelErrorBoundary panelName="Resources">
            <ResourcesPanel onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "drupal"} onOpenChange={sheetOpenChange("drupal", setActivePanel)}>
        <SheetContent className="w-[520px]">
          <SheetTitle className="sr-only">Drupal</SheetTitle>
          <PanelErrorBoundary panelName="Drupal">
            <DrupalPanel projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "kb"} onOpenChange={sheetOpenChange("kb", setActivePanel)}>
        <SheetContent>
          <SheetTitle className="sr-only">Knowledge Base</SheetTitle>
          <PanelErrorBoundary panelName="Knowledge Base">
            <KBPanel projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "snapshots"} onOpenChange={sheetOpenChange("snapshots", setActivePanel)}>
        <SheetContent>
          <SheetTitle className="sr-only">Snapshots</SheetTitle>
          <PanelErrorBoundary panelName="Snapshots">
            <SnapshotsPanel projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "context"} onOpenChange={sheetOpenChange("context", setActivePanel)}>
        <SheetContent className="w-[520px]">
          <SheetTitle className="sr-only">Context Editor</SheetTitle>
          <PanelErrorBoundary panelName="Context Editor">
            <ContextEditorPanel projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "ui-builder"} onOpenChange={sheetOpenChange("ui-builder", setActivePanel)}>
        <SheetContent className="w-[560px]">
          <SheetTitle className="sr-only">UI Builder</SheetTitle>
          <PanelErrorBoundary panelName="UI Builder">
            <UIBuilderPanel onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "planning"} onOpenChange={sheetOpenChange("planning", setActivePanel)}>
        <SheetContent className="w-[600px]">
          <SheetTitle className="sr-only">Planning</SheetTitle>
          <PanelErrorBoundary panelName="Planning">
            <PlanningPanel projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "kb-builder"} onOpenChange={sheetOpenChange("kb-builder", setActivePanel)}>
        <SheetContent className="w-[640px] sm:max-w-[640px]">
          <SheetTitle className="sr-only">KB Builder</SheetTitle>
          <PanelErrorBoundary panelName="KB Builder">
            <KBBuilderPanel projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>

      <Sheet open={activePanel === "issues"} onOpenChange={sheetOpenChange("issues", setActivePanel)}>
        <SheetContent className="w-[520px]">
          <SheetTitle className="sr-only">Issues</SheetTitle>
          <PanelErrorBoundary panelName="Issues">
            <IssuesPanel projectId={projectId} onClose={close} />
          </PanelErrorBoundary>
        </SheetContent>
      </Sheet>
    </>
  );
}
