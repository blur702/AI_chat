"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels";
import { useDrupalLocal, useDrupal } from "@workstation/api/hooks";
import { DrupalDevSidebar, type DrupalDevTab } from "./drupal-dev-sidebar";
import { DrupalFileExplorer } from "./drupal-file-explorer";
import { DrupalEditorPane } from "./drupal-editor-pane";
import { DrupalModuleList } from "./drupal-module-list";
import { DrupalThemeList } from "./drupal-theme-list";
import { DrupalConfigPanel } from "./drupal-config-panel";
import { DrupalDrushTerminal } from "./drupal-drush-terminal";
import { DrupalDbPanel } from "./drupal-db-panel";
import { DrupalColorPalette } from "./drupal-color-palette";
import { ModuleScaffoldDialog } from "./module-scaffold-dialog";
import { StagingControls } from "./staging-controls";
import { PreviewPane } from "@/components/workspace/preview/preview-pane";
import { AlertTriangle } from "lucide-react";

const DRUPAL_PROJECT_KEY = "drupal_staging_project_id";

function useStagingProjectId(): string {
  const [projectId, setProjectId] = useState("");
  useEffect(() => {
    const stored = localStorage.getItem(DRUPAL_PROJECT_KEY) || "";
    setProjectId(stored);
  }, []);
  return projectId;
}

export function DrupalDevLayout() {
  const [activeTab, setActiveTab] = useState<DrupalDevTab>("files");
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);

  const drupal = useDrupalLocal();
  const { loadFileTree } = drupal;
  const stagingProjectId = useStagingProjectId();
  const staging = useDrupal(stagingProjectId);
  const hasStagingProject = Boolean(stagingProjectId);

  // Load file tree on mount
  useEffect(() => {
    loadFileTree();
  }, [loadFileTree]);

  // Handle file selection — navigate into directory or open file
  const handleFileSelect = useCallback(
    (path: string) => {
      drupal.openFile(path);
      setEditorDirty(false);
    },
    [drupal]
  );

  // Handle save
  const handleSave = useCallback(
    async (content: string) => {
      if (!drupal.activeFile) return;
      await drupal.saveFile(drupal.activeFile.path, content);
      setEditorDirty(false);
    },
    [drupal]
  );

  // Handle close editor
  const handleCloseEditor = useCallback(() => {
    if (editorDirty && !confirm("Unsaved changes will be lost. Continue?")) return;
    // Clear by opening no file — just set activeFile state through hook
    // We don't have a "close" in the hook, so we do this minimally:
    setEditorDirty(false);
  }, [editorDirty]);

  // Navigate from modules/themes list to files tab
  const handleOpenModulePath = useCallback(
    (path: string) => {
      setActiveTab("files");
      drupal.loadFileTree(path);
    },
    [drupal]
  );

  // Create file/dir from explorer
  const handleCreateFile = useCallback(
    async (name: string) => {
      await drupal.createFile(name);
      drupal.loadFileTree();
    },
    [drupal]
  );

  const handleCreateDir = useCallback(
    async (name: string) => {
      await drupal.createDirectory(name);
      drupal.loadFileTree();
    },
    [drupal]
  );

  const handleDeleteFile = useCallback(
    async (path: string) => {
      if (!confirm(`Delete "${path}"?`)) return;
      await drupal.deleteFile(path);
      drupal.loadFileTree();
    },
    [drupal]
  );

  // Scaffold callback
  const handleScaffold = useCallback(
    async (data: { machine_name: string; name: string; description?: string; package?: string }) => {
      await drupal.scaffoldModule(data);
      drupal.loadModules();
      drupal.loadFileTree();
    },
    [drupal]
  );

  // Load modules/themes when those tabs are opened
  useEffect(() => {
    if (activeTab === "modules") drupal.loadModules();
    if (activeTab === "themes") drupal.loadThemes();
    // loadModules/loadThemes come from useDrupalLocal callbacks and are stable.
    // This effect should react only to tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Determine if we need a split panel (file explorer + editor) or full-width panel
  const needsSplit = activeTab === "files" || activeTab === "modules" || activeTab === "themes";

  // Compute preview URL: staging sandbox URL or fallback to local drupal
  const previewUrl = staging.stagingStatus?.preview_url || "http://localhost:9080";

  return (
    <div className="flex h-full" role="main" aria-label="Drupal Development IDE">
      <DrupalDevSidebar active={activeTab} onChange={setActiveTab} />

      {/* Error banners */}
      {Boolean(drupal.error || staging.error) && (
        <div
          className="absolute top-0 left-12 right-0 z-50 bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center gap-2 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {[drupal.error, staging.error].filter(Boolean).join(" | ")}
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col" role="tabpanel" id={`drupal-panel-${activeTab}`} aria-label={`${activeTab} panel`}>
        {/* Staging controls toolbar */}
        {hasStagingProject && (
          <StagingControls
            stagingStatus={staging.stagingStatus}
            stagingLoading={staging.stagingLoading}
            cloning={staging.cloning}
            pushing={staging.pushing}
            stagingStarting={staging.stagingStarting}
            stagingStopping={staging.stagingStopping}
            onClone={staging.cloneProduction}
            onPush={staging.pushToProduction}
            onStart={staging.startStaging}
            onStop={staging.stopStaging}
            onRefresh={staging.refreshStaging}
          />
        )}

        <div className="flex-1 min-h-0">
        {needsSplit ? (
          <Group orientation="horizontal" id="drupal-split" className="h-full">
            {/* Left panel: tree/list */}
            <Panel
              id="drupal-left"
              defaultSize={25}
              minSize={15}
              maxSize={45}
            >
              {activeTab === "files" && (
                <DrupalFileExplorer
                  files={drupal.files}
                  loading={drupal.fileTreeLoading}
                  activePath={drupal.activeFile?.path}
                  onSelect={handleFileSelect}
                  onRefresh={() => drupal.loadFileTree()}
                  onCreateFile={handleCreateFile}
                  onCreateDir={handleCreateDir}
                  onDelete={handleDeleteFile}
                />
              )}
              {activeTab === "modules" && (
                <DrupalModuleList
                  modules={drupal.modules}
                  loading={drupal.modulesLoading}
                  onRefresh={() => drupal.loadModules()}
                  onOpenFile={handleOpenModulePath}
                  onScaffold={() => setScaffoldOpen(true)}
                />
              )}
              {activeTab === "themes" && (
                <DrupalThemeList
                  themes={drupal.themes}
                  loading={drupal.themesLoading}
                  onRefresh={() => drupal.loadThemes()}
                  onOpenFile={handleOpenModulePath}
                />
              )}
            </Panel>

            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />

            {/* Right panel: editor */}
            <Panel id="drupal-editor" defaultSize={75} minSize={40}>
              <DrupalEditorPane
                path={drupal.activeFile?.path ?? null}
                content={drupal.activeFile?.content ?? ""}
                language={drupal.activeFile?.language ?? "plaintext"}
                modified={editorDirty}
                onSave={handleSave}
                onClose={handleCloseEditor}
              />
            </Panel>
          </Group>
        ) : (
          <div className="h-full">
            {activeTab === "config" && (
              <DrupalConfigPanel
                configStatus={drupal.configStatus}
                loading={drupal.statusLoading}
                onLoadStatus={drupal.loadConfigStatus}
                onExport={drupal.exportConfig}
                onImport={drupal.importConfig}
              />
            )}
            {activeTab === "drush" && (
              <DrupalDrushTerminal
                history={drupal.drushHistory}
                loading={drupal.drushLoading}
                onRun={drupal.runDrush}
              />
            )}
            {activeTab === "palette" && (
              <DrupalColorPalette
                palette={drupal.palette}
                loading={drupal.paletteLoading}
                onGenerate={drupal.generatePalette}
                onValidate={drupal.validatePalette}
                onAdjust={drupal.adjustPalette}
              />
            )}
            {activeTab === "db" && <DrupalDbPanel />}
            {activeTab === "preview" && (
              <PreviewPane defaultUrl={previewUrl} />
            )}
          </div>
        )}
        </div>
      </div>

      {/* Module scaffold dialog */}
      <ModuleScaffoldDialog
        open={scaffoldOpen}
        onClose={() => setScaffoldOpen(false)}
        onScaffold={handleScaffold}
      />
    </div>
  );
}
