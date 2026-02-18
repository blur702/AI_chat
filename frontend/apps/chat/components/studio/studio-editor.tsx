"use client";

import { useEffect, useCallback, useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { StudioToolbar } from "./studio-toolbar";
import { MediaBin } from "./media-bin";
import { PreviewCanvas } from "./preview-canvas";
import { PropertiesPanel } from "./properties-panel";
import { SubtitleEditor } from "./subtitle-editor";
import { TimelinePanel } from "./timeline/timeline-panel";
import { useStudioStore } from "./use-studio-store";
import type { TimelineData } from "./use-studio-store";

interface StudioEditorProps {
  projectId: string;
}

export function StudioEditor({ projectId }: StudioEditorProps) {
  const { setProjectId, setProjectName, setTimeline, setMediaAssets, markClean } = useStudioStore();

  const [loaded, setLoaded] = useState(false);
  const [rightTab, setRightTab] = useState<"properties" | "subtitles">("properties");

  // Load project data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const fetchOpts = { credentials: "include" as RequestCredentials };

      try {
        // Fetch project
        const projRes = await fetch(`/api/studio/projects/${projectId}`, fetchOpts);
        if (!projRes.ok) return;
        const project = await projRes.json();

        if (cancelled) return;

        setProjectId(projectId);
        setProjectName(project.name);
        if (project.timeline_data) {
          setTimeline(project.timeline_data as TimelineData);
        }
        markClean();

        // Fetch media
        const mediaRes = await fetch(`/api/studio/projects/${projectId}/media`, fetchOpts);
        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          setMediaAssets(mediaData.assets || []);
        }

        setLoaded(true);
      } catch (err) {
        console.error("Failed to load project:", err);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, setProjectId, setProjectName, setTimeline, setMediaAssets, markClean]);

  // Save handler
  const handleSave = useCallback(async () => {
    const state = useStudioStore.getState();
    try {
      await fetch(`/api/studio/projects/${projectId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.projectName,
          timeline_data: state.timeline,
          duration_seconds: state.duration,
        }),
      });
      markClean();
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, [projectId, markClean]);

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <StudioToolbar onSave={handleSave} projectId={projectId} />

      <Group orientation="vertical" id="studio-main" className="flex-1">
        {/* Top: Media + Preview + Properties */}
        <Panel defaultSize={60} minSize={30}>
          <Group orientation="horizontal" id="studio-top">
            {/* Left: Media Bin */}
            <Panel defaultSize={20} minSize={15} maxSize={35}>
              <MediaBin projectId={projectId} />
            </Panel>

            <Separator className="w-1 bg-border transition-colors hover:bg-primary/50" />

            {/* Center: Preview */}
            <Panel defaultSize={55} minSize={30}>
              <PreviewCanvas />
            </Panel>

            <Separator className="w-1 bg-border transition-colors hover:bg-primary/50" />

            {/* Right: Properties / Subtitles */}
            <Panel defaultSize={25} minSize={15} maxSize={35}>
              <div className="flex h-full flex-col">
                <div className="flex shrink-0 border-b bg-card">
                  <button
                    onClick={() => setRightTab("properties")}
                    className={`flex-1 px-3 py-1.5 text-[10px] font-medium transition-colors ${
                      rightTab === "properties"
                        ? "border-b-2 border-primary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Properties
                  </button>
                  <button
                    onClick={() => setRightTab("subtitles")}
                    className={`flex-1 px-3 py-1.5 text-[10px] font-medium transition-colors ${
                      rightTab === "subtitles"
                        ? "border-b-2 border-primary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Subtitles
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {rightTab === "properties" ? (
                    <PropertiesPanel />
                  ) : (
                    <SubtitleEditor projectId={projectId} />
                  )}
                </div>
              </div>
            </Panel>
          </Group>
        </Panel>

        <Separator className="h-1 bg-border transition-colors hover:bg-primary/50" />

        {/* Bottom: Timeline */}
        <Panel defaultSize={40} minSize={20}>
          <TimelinePanel />
        </Panel>
      </Group>
    </div>
  );
}
