"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import { extractErrorMessage } from "../utils/error";
import type {
  DrupalConnectRequest,
  DrupalSiteInfo,
  DrupalSiteConfig,
  DrupalContentType,
  DrupalNode,
  DrupalNodeCreateRequest,
  DrupalNodeUpdateRequest,
  DrushCommandResponse,
  SyncStatus,
  StagingStatus,
  CloneRequest,
  CloneResponse,
  PushRequest,
  PushResponse,
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
  // Content CRUD
  contentTypes: DrupalContentType[];
  contentTypesLoading: boolean;
  nodes: DrupalNode[];
  nodesLoading: boolean;
  selectedBundle: string | null;
  setSelectedBundle: (bundle: string | null) => void;
  fetchContentTypes: () => Promise<void>;
  fetchNodes: (bundle: string) => Promise<void>;
  createNode: (bundle: string, data: DrupalNodeCreateRequest) => Promise<DrupalNode>;
  updateNode: (bundle: string, nodeUuid: string, data: DrupalNodeUpdateRequest) => Promise<DrupalNode>;
  // Staging
  stagingStatus: StagingStatus | null;
  stagingLoading: boolean;
  cloning: boolean;
  cloneProduction: (opts?: CloneRequest) => Promise<CloneResponse | null>;
  pushToProduction: (opts: PushRequest) => Promise<PushResponse | null>;
  startStaging: () => Promise<void>;
  stopStaging: () => Promise<void>;
  stagingStarting: boolean;
  stagingStopping: boolean;
  refreshStaging: () => Promise<void>;
}

/**
 * Manages the Drupal site connection for a project, including sync, Drush, content CRUD, and staging operations.
 * Resets and re-fetches all state when `projectId` changes.
 * @param projectId - The project associated with the Drupal site.
 * @returns Site info, config, sync/staging state, and functions for connect, disconnect, pull, push, Drush, and content management.
 */
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

  // Content state
  const [contentTypes, setContentTypes] = useState<DrupalContentType[]>([]);
  const [contentTypesLoading, setContentTypesLoading] = useState(false);
  const [nodes, setNodes] = useState<DrupalNode[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);

  // Staging state
  const [stagingStatus, setStagingStatus] = useState<StagingStatus | null>(null);
  const [stagingLoading, setStagingLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [stagingStarting, setStagingStarting] = useState(false);
  const [stagingStopping, setStagingStopping] = useState(false);

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

  // Reset state and re-fetch when projectId changes
  useEffect(() => {
    setSite(null);
    setConfig(null);
    setSyncStatus(null);
    setError(null);
    setDrushOutput(null);
    setContentTypes([]);
    setNodes([]);
    setSelectedBundle(null);
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
        setError(extractErrorMessage(err, "Connection failed"));
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
      setContentTypes([]);
      setNodes([]);
      setSelectedBundle(null);
    } catch (err) {
      setError(extractErrorMessage(err, "Disconnect failed"));
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
      setError(extractErrorMessage(err, "Failed to load config"));
    } finally {
      setConfigLoading(false);
    }
  }, [projectId]);

  // Auto-fetch config when site is connected
  const siteConnected = !!site;
  useEffect(() => {
    if (siteConnected) {
      fetchConfig();
    }
  }, [siteConnected, fetchConfig]);

  const runDrush = useCallback(
    async (command: string) => {
      try {
        setDrushRunning(true);
        setError(null);
        const result = await getClient().runDrush(projectId, command);
        setDrushOutput(result);
      } catch (err) {
        setError(extractErrorMessage(err, "Drush command failed"));
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
      setError(extractErrorMessage(err, "Pull failed"));
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
      setError(extractErrorMessage(err, "Push failed"));
    } finally {
      setPushing(false);
    }
  }, [projectId, fetchSyncStatus]);

  // Content CRUD

  const fetchContentTypes = useCallback(async () => {
    try {
      setContentTypesLoading(true);
      setError(null);
      const data = await getClient().getDrupalContentTypes(projectId);
      setContentTypes(data);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load content types"));
    } finally {
      setContentTypesLoading(false);
    }
  }, [projectId]);

  const fetchNodes = useCallback(
    async (bundle: string) => {
      try {
        setNodesLoading(true);
        setError(null);
        const data = await getClient().listDrupalContent(projectId, bundle);
        setNodes(data.nodes);
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to load content"));
      } finally {
        setNodesLoading(false);
      }
    },
    [projectId]
  );

  const createNode = useCallback(
    async (bundle: string, data: DrupalNodeCreateRequest): Promise<DrupalNode> => {
      setError(null);
      try {
        const node = await getClient().createDrupalNode(projectId, bundle, data);
        // Refresh the list
        await fetchNodes(bundle);
        return node;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to create node"));
        throw err;
      }
    },
    [projectId, fetchNodes]
  );

  const updateNode = useCallback(
    async (bundle: string, nodeUuid: string, data: DrupalNodeUpdateRequest): Promise<DrupalNode> => {
      setError(null);
      try {
        const node = await getClient().updateDrupalNode(projectId, bundle, nodeUuid, data);
        // Refresh the list
        await fetchNodes(bundle);
        return node;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to update node"));
        throw err;
      }
    },
    [projectId, fetchNodes]
  );

  // Auto-fetch content types when site is connected
  useEffect(() => {
    if (siteConnected) {
      fetchContentTypes();
    }
  }, [siteConnected, fetchContentTypes]);

  // Staging methods

  const fetchStagingStatus = useCallback(async () => {
    try {
      setStagingLoading(true);
      const data = await getClient().getDrupalStagingStatus(projectId);
      setStagingStatus(data);
    } catch {
      // ignore — staging may not be configured
    } finally {
      setStagingLoading(false);
    }
  }, [projectId]);

  const refreshStaging = useCallback(async () => {
    await fetchStagingStatus();
  }, [fetchStagingStatus]);

  // Auto-fetch staging status when site is connected
  useEffect(() => {
    if (siteConnected) {
      fetchStagingStatus();
    }
  }, [siteConnected, fetchStagingStatus]);

  const cloneProduction = useCallback(
    async (opts?: CloneRequest): Promise<CloneResponse | null> => {
      try {
        setCloning(true);
        setError(null);
        const result = await getClient().cloneDrupalProduction(projectId, opts);
        await fetchStagingStatus();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Clone failed"));
        return null;
      } finally {
        setCloning(false);
      }
    },
    [projectId, fetchStagingStatus]
  );

  const pushToProduction = useCallback(
    async (opts: PushRequest): Promise<PushResponse | null> => {
      try {
        setPushing(true);
        setError(null);
        const result = await getClient().pushDrupalToProduction(projectId, opts);
        await Promise.all([fetchSyncStatus(), fetchStagingStatus()]);
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Push failed"));
        return null;
      } finally {
        setPushing(false);
      }
    },
    [projectId, fetchSyncStatus, fetchStagingStatus]
  );

  const startStaging = useCallback(async () => {
    try {
      setStagingStarting(true);
      setError(null);
      await getClient().startDrupalStaging(projectId);
      await fetchStagingStatus();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to start staging"));
    } finally {
      setStagingStarting(false);
    }
  }, [projectId, fetchStagingStatus]);

  const stopStaging = useCallback(async () => {
    try {
      setStagingStopping(true);
      setError(null);
      await getClient().stopDrupalStaging(projectId);
      await fetchStagingStatus();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to stop staging"));
    } finally {
      setStagingStopping(false);
    }
  }, [projectId, fetchStagingStatus]);

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
    contentTypes,
    contentTypesLoading,
    nodes,
    nodesLoading,
    selectedBundle,
    setSelectedBundle,
    fetchContentTypes,
    fetchNodes,
    createNode,
    updateNode,
    // Staging
    stagingStatus,
    stagingLoading,
    cloning,
    cloneProduction,
    pushToProduction,
    startStaging,
    stopStaging,
    stagingStarting,
    stagingStopping,
    refreshStaging,
  };
}
