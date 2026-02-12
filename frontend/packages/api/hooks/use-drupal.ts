"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  DrupalConnectRequest,
  DrupalSiteInfo,
  DrupalSiteConfig,
  DrushCommandResponse,
  SyncStatus,
} from "../types";

export interface UseDrupalReturn {
  site: DrupalSiteInfo | null;
  siteLoading: boolean;
  config: DrupalSiteConfig | null;
  configLoading: boolean;
  connect: (data: DrupalConnectRequest) => Promise<void>;
  connecting: boolean;
  disconnect: () => Promise<void>;
  disconnecting: boolean;
  runDrush: (command: string) => Promise<void>;
  drushOutput: DrushCommandResponse | null;
  drushRunning: boolean;
  pull: () => Promise<void>;
  pulling: boolean;
  push: () => Promise<void>;
  pushing: boolean;
  syncStatus: SyncStatus | null;
  syncLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDrupal(projectId: string): UseDrupalReturn {
  const [site, setSite] = useState<DrupalSiteInfo | null>(null);
  const [siteLoading, setSiteLoading] = useState(true);
  const [config, setConfig] = useState<DrupalSiteConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [drushOutput, setDrushOutput] = useState<DrushCommandResponse | null>(null);
  const [drushRunning, setDrushRunning] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSite = useCallback(async () => {
    try {
      setSiteLoading(true);
      setError(null);
      const data = await getClient().getDrupalSite(projectId);
      setSite(data);
    } catch {
      setSite(null);
    } finally {
      setSiteLoading(false);
    }
  }, [projectId]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      setSyncLoading(true);
      const data = await getClient().getDrupalSyncStatus(projectId);
      setSyncStatus(data);
    } catch {
      // ignore
    } finally {
      setSyncLoading(false);
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchSite(), fetchSyncStatus()]);
  }, [fetchSite, fetchSyncStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = useCallback(
    async (data: DrupalConnectRequest) => {
      try {
        setConnecting(true);
        setError(null);
        await getClient().connectDrupalSite(projectId, data);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [projectId, refresh]
  );

  const disconnect = useCallback(async () => {
    try {
      setDisconnecting(true);
      setError(null);
      await getClient().disconnectDrupalSite(projectId);
      setSite(null);
      setConfig(null);
      setSyncStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }, [projectId]);

  const fetchConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      setError(null);
      const data = await getClient().getDrupalConfig(projectId);
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    } finally {
      setConfigLoading(false);
    }
  }, [projectId]);

  // Auto-fetch config when site is connected
  useEffect(() => {
    if (site) {
      fetchConfig();
    }
  }, [site, fetchConfig]);

  const runDrush = useCallback(
    async (command: string) => {
      try {
        setDrushRunning(true);
        setError(null);
        const result = await getClient().runDrush(projectId, command);
        setDrushOutput(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Drush command failed");
      } finally {
        setDrushRunning(false);
      }
    },
    [projectId]
  );

  const pull = useCallback(async () => {
    try {
      setPulling(true);
      setError(null);
      await getClient().pullDrupalSite(projectId);
      await fetchSyncStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  }, [projectId, fetchSyncStatus]);

  const push = useCallback(async () => {
    try {
      setPushing(true);
      setError(null);
      await getClient().pushDrupalConfig(projectId);
      await fetchSyncStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setPushing(false);
    }
  }, [projectId, fetchSyncStatus]);

  return {
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
    syncLoading,
    error,
    refresh,
  };
}
