"use client";

import { useState } from "react";
import {
  Button,
  Badge,
  ScrollArea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workstation/ui";
import {
  X,
  Globe,
  RefreshCw,
  Loader2,
  Unplug,
  Settings2,
  Terminal,
  ArrowLeftRight,
} from "lucide-react";
import { useDrupal } from "@workstation/api/hooks";
import { ConnectDialog } from "./connect-dialog";
import { DrushTerminal } from "./drush-terminal";
import { SyncStatus } from "./sync-status";

interface DrupalPanelProps {
  projectId: string;
  onClose: () => void;
}

export function DrupalPanel({ projectId, onClose }: DrupalPanelProps) {
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
  } = useDrupal(projectId);

  const [showConnect, setShowConnect] = useState(false);

  // Loading state
  if (siteLoading) {
    return (
      <div className="flex h-full flex-col border-l">
        <PanelHeader onClose={onClose} onRefresh={refresh} loading />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Not connected — show connect prompt
  if (!site) {
    return (
      <div className="flex h-full flex-col border-l">
        <PanelHeader onClose={onClose} onRefresh={refresh} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <Globe className="h-10 w-10 text-muted-foreground/50" />
          <div className="text-center space-y-1">
            <div className="text-sm font-medium">No Drupal Site Connected</div>
            <div className="text-xs text-muted-foreground">
              Connect a remote Drupal site to enable config sync, Drush commands,
              and database management.
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

  // Connected — show tabbed interface
  return (
    <div className="flex h-full flex-col border-l">
      <PanelHeader
        onClose={onClose}
        onRefresh={refresh}
        siteName={site.site_name ?? site.site_url}
        onDisconnect={disconnect}
        disconnecting={disconnecting}
        onReconnect={() => setShowConnect(true)}
      />

      <Tabs defaultValue="config" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 grid w-auto grid-cols-3">
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

        {/* Config tab */}
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
                        {config.themes.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t}
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
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Drush tab */}
        <TabsContent value="drush" className="flex-1 overflow-hidden mt-0">
          <DrushTerminal
            onRunDrush={runDrush}
            drushOutput={drushOutput}
            drushRunning={drushRunning}
          />
        </TabsContent>

        {/* Sync tab */}
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

function PanelHeader({
  onClose,
  onRefresh,
  loading,
  siteName,
  onDisconnect,
  disconnecting,
  onReconnect,
}: {
  onClose: () => void;
  onRefresh: () => Promise<void>;
  loading?: boolean;
  siteName?: string;
  onDisconnect?: () => Promise<void>;
  disconnecting?: boolean;
  onReconnect?: () => void;
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
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
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
