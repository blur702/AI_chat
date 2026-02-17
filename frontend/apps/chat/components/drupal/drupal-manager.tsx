"use client";

import { useState, useCallback } from "react";
import {
  Button,
  Badge,
  ScrollArea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Input,
  Textarea,
} from "@workstation/ui";
import {
  Globe,
  RefreshCw,
  Loader2,
  Unplug,
  Settings2,
  Terminal,
  ArrowLeftRight,
  FileText,
  Plus,
  Save,
  X,
  ChevronRight,
} from "lucide-react";
import { useDrupal } from "@workstation/api/hooks";
import type { DrupalNode } from "@workstation/api/types";
import { ConnectDialog } from "../workspace/drupal/connect-dialog";
import { DrushTerminal } from "../workspace/drupal/drush-terminal";
import { SyncStatus } from "../workspace/drupal/sync-status";

interface DrupalManagerProps {
  projectId: string;
}

export function DrupalManager({ projectId }: DrupalManagerProps) {
  const {
    site,
    siteLoading,
    config,
    configLoading,
    connect,
    connecting,
    disconnect,
    disconnecting,
    runDrush,
    drushOutput,
    drushRunning,
    pull,
    pulling,
    push,
    pushing,
    syncStatus,
    error,
    refresh,
    contentTypes,
    contentTypesLoading,
    nodes,
    nodesLoading,
    selectedBundle,
    setSelectedBundle,
    fetchNodes,
    createNode,
    updateNode,
  } = useDrupal(projectId);

  const [showConnect, setShowConnect] = useState(false);

  if (siteLoading) {
    return (
      <div className="flex h-full flex-col">
        <ManagerHeader onRefresh={refresh} loading />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex h-full flex-col">
        <ManagerHeader onRefresh={refresh} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <Globe className="h-10 w-10 text-muted-foreground/50" />
          <div className="text-center space-y-1">
            <div className="text-sm font-medium">No Drupal Site Connected</div>
            <div className="text-xs text-muted-foreground">
              Connect a remote Drupal site to manage content, run Drush commands,
              and sync configuration.
            </div>
          </div>
          <Button onClick={() => setShowConnect(true)}>
            <Globe className="mr-2 h-4 w-4" />
            Connect Site
          </Button>
          <ConnectDialog
            open={showConnect}
            onOpenChange={setShowConnect}
            onConnect={connect}
            connecting={connecting}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ManagerHeader
        onRefresh={refresh}
        siteName={site.site_name ?? site.site_url}
        onDisconnect={disconnect}
        disconnecting={disconnecting}
      />

      <Tabs defaultValue="content" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 grid w-auto grid-cols-4">
          <TabsTrigger value="content" className="text-xs gap-1">
            <FileText className="h-3 w-3" />
            Content
          </TabsTrigger>
          <TabsTrigger value="config" className="text-xs gap-1">
            <Settings2 className="h-3 w-3" />
            Config
          </TabsTrigger>
          <TabsTrigger value="drush" className="text-xs gap-1">
            <Terminal className="h-3 w-3" />
            Drush
          </TabsTrigger>
          <TabsTrigger value="sync" className="text-xs gap-1">
            <ArrowLeftRight className="h-3 w-3" />
            Sync
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="flex-1 overflow-hidden mt-0">
          <ContentTab
            contentTypes={contentTypes}
            contentTypesLoading={contentTypesLoading}
            nodes={nodes}
            nodesLoading={nodesLoading}
            selectedBundle={selectedBundle}
            onSelectBundle={(b) => {
              setSelectedBundle(b);
              if (b) fetchNodes(b);
            }}
            onCreateNode={createNode}
            onUpdateNode={updateNode}
            error={error}
          />
        </TabsContent>

        <TabsContent value="config" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {configLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading config...
                </div>
              ) : config ? (
                <>
                  {config.drupal_version && (
                    <ConfigSection title="Drupal Version">
                      <Badge variant="secondary">{config.drupal_version}</Badge>
                    </ConfigSection>
                  )}
                  {config.site_name && (
                    <ConfigSection title="Site Name">
                      <span className="text-xs">{config.site_name}</span>
                    </ConfigSection>
                  )}
                  <ConfigSection title="Content Types" count={config.content_types.length}>
                    {config.content_types.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {config.content_types.map((ct) => (
                          <Badge key={ct} variant="outline" className="text-[10px]">
                            {ct}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">None detected</span>
                    )}
                  </ConfigSection>
                  <ConfigSection title="Modules" count={config.modules.length}>
                    {config.modules.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {config.modules.map((m) => (
                          <Badge key={m} variant="outline" className="text-[10px]">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">None detected</span>
                    )}
                  </ConfigSection>
                  <ConfigSection title="Themes" count={config.themes.length}>
                    {config.themes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {config.themes.map((th) => (
                          <Badge key={th} variant="outline" className="text-[10px]">
                            {th}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">None detected</span>
                    )}
                  </ConfigSection>
                </>
              ) : (
                <div className="text-xs text-muted-foreground py-4">
                  Could not load remote site config.
                </div>
              )}
              {config?.error && (
                <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-600 dark:text-yellow-400">
                  Config fetch error: {config.error}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="drush" className="flex-1 overflow-hidden mt-0">
          <DrushTerminal
            onRunDrush={runDrush}
            drushOutput={drushOutput}
            drushRunning={drushRunning}
          />
        </TabsContent>

        <TabsContent value="sync" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <SyncStatus
              syncStatus={syncStatus}
              pulling={pulling}
              pushing={pushing}
              onPull={pull}
              onPush={push}
              error={error}
            />
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <ConnectDialog
        open={showConnect}
        onOpenChange={setShowConnect}
        onConnect={connect}
        connecting={connecting}
      />
    </div>
  );
}

// --- Content Tab ---

interface ContentTabProps {
  contentTypes: { id: string; label: string; description?: string }[];
  contentTypesLoading: boolean;
  nodes: DrupalNode[];
  nodesLoading: boolean;
  selectedBundle: string | null;
  onSelectBundle: (bundle: string | null) => void;
  onCreateNode: (bundle: string, data: { title: string; body?: string; body_format?: string; status?: boolean }) => Promise<DrupalNode>;
  onUpdateNode: (bundle: string, uuid: string, data: { title?: string; body?: string; body_format?: string; status?: boolean }) => Promise<DrupalNode>;
  error: string | null;
}

function ContentTab({
  contentTypes,
  contentTypesLoading,
  nodes,
  nodesLoading,
  selectedBundle,
  onSelectBundle,
  onCreateNode,
  onUpdateNode,
  error,
}: ContentTabProps) {
  const [editingNode, setEditingNode] = useState<DrupalNode | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editStatus, setEditStatus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const startEdit = useCallback((node: DrupalNode) => {
    setEditingNode(node);
    setEditTitle(node.title);
    setEditBody(node.body ?? "");
    setEditStatus(node.status);
    setCreating(false);
  }, []);

  const startCreate = useCallback(() => {
    setEditingNode(null);
    setEditTitle("");
    setEditBody("");
    setEditStatus(true);
    setCreating(true);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingNode(null);
    setCreating(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedBundle) return;
    setSaving(true);
    try {
      if (creating) {
        await onCreateNode(selectedBundle, {
          title: editTitle,
          body: editBody || undefined,
          status: editStatus,
        });
      } else if (editingNode) {
        await onUpdateNode(selectedBundle, editingNode.uuid, {
          title: editTitle,
          body: editBody,
          status: editStatus,
        });
      }
      setEditingNode(null);
      setCreating(false);
    } catch {
      // error set by hook
    } finally {
      setSaving(false);
    }
  }, [selectedBundle, creating, editingNode, editTitle, editBody, editStatus, onCreateNode, onUpdateNode]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Content type selector */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Content Type</span>
          {contentTypesLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          ) : contentTypes.length === 0 ? (
            <div className="text-xs text-muted-foreground">No content types found</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {contentTypes.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => onSelectBundle(ct.id)}
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] transition-colors cursor-pointer ${
                    selectedBundle === ct.id
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:border-primary/50 text-muted-foreground"
                  }`}
                >
                  {ct.label || ct.id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Node list */}
        {selectedBundle && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">
                Nodes ({nodes.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={startCreate}
              >
                <Plus className="h-3 w-3" />
                New
              </Button>
            </div>

            {nodesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading nodes...
              </div>
            ) : nodes.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                No nodes found for this content type.
              </div>
            ) : (
              <div className="space-y-1">
                {nodes.map((node) => (
                  <button
                    key={node.uuid}
                    onClick={() => startEdit(node)}
                    className={`w-full text-left rounded-md border px-3 py-2 text-xs transition-colors cursor-pointer ${
                      editingNode?.uuid === node.uuid
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{node.title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant={node.status ? "default" : "secondary"}
                          className="text-[9px] h-4 px-1"
                        >
                          {node.status ? "Published" : "Draft"}
                        </Badge>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                    {node.changed && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Updated {new Date(node.changed).toLocaleDateString()}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Edit / Create form */}
        {(editingNode || creating) && selectedBundle && (
          <div className="rounded-md border border-primary/30 bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">
                {creating ? "Create Node" : "Edit Node"}
              </span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={cancelEdit}>
                <X className="h-3 w-3" />
              </Button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="drupal-node-title" className="text-[11px] font-medium">Title</label>
              <Input
                id="drupal-node-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="h-7 text-xs"
                placeholder="Node title"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="drupal-node-body" className="text-[11px] font-medium">Body</label>
              <Textarea
                id="drupal-node-body"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="text-xs min-h-[80px]"
                placeholder="Node body (HTML)"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium">Published</label>
              <button
                type="button"
                onClick={() => setEditStatus(!editStatus)}
                role="switch"
                aria-checked={editStatus}
                aria-label="Published"
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  editStatus ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    editStatus ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleSave}
                disabled={saving || !editTitle.trim()}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                {creating ? "Create" : "Save"}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-500">
            {error}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// --- Shared components ---

function ManagerHeader({
  onRefresh,
  loading,
  siteName,
  onDisconnect,
  disconnecting,
}: {
  onRefresh: () => Promise<void>;
  loading?: boolean;
  siteName?: string;
  onDisconnect?: () => Promise<void>;
  disconnecting?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide truncate">
          {siteName ?? "Drupal"}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onDisconnect && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onDisconnect}
            disabled={disconnecting}
            title="Disconnect site"
          >
            {disconnecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unplug className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onRefresh}
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}

function ConfigSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="h-4 text-[9px] px-1">
            {count}
          </Badge>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
