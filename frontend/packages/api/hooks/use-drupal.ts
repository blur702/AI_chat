"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  ComposerRequireRequest,
  ComposerRemoveRequest,
  ComposerUpdateRequest,
  ComposerOperationResponse,
  ModuleEnableRequest,
  ModuleDisableRequest,
  ThemeEnableRequest,
  ThemeDisableRequest,
  DrushOperationResponse,
  ModuleThemeListItem,
  ModuleThemeListResponse,
  ContentTypeCreateRequest,
  ContentTypeCreateResponse,
  BlockContentCreateRequest,
  BlockContentResponse,
  BlockContentListResponse,
  BlockContentUpdateRequest,
  ThemeScaffoldRequest,
  ThemeScaffoldResponse,
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
  updateNode: (
    bundle: string,
    nodeUuid: string,
    data: DrupalNodeUpdateRequest,
  ) => Promise<DrupalNode>;
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
  // Module/Theme management
  modules: ModuleThemeListItem[];
  modulesLoading: boolean;
  themes: ModuleThemeListItem[];
  themesLoading: boolean;
  fetchModules: (statusFilter?: string) => Promise<void>;
  fetchThemes: (statusFilter?: string) => Promise<void>;
  enableModules: (data: ModuleEnableRequest) => Promise<DrushOperationResponse | null>;
  disableModules: (data: ModuleDisableRequest) => Promise<DrushOperationResponse | null>;
  enableTheme: (data: ThemeEnableRequest) => Promise<DrushOperationResponse | null>;
  disableTheme: (data: ThemeDisableRequest) => Promise<DrushOperationResponse | null>;
  modulesOperating: boolean;
  themesOperating: boolean;
  // Composer
  composerRequire: (data: ComposerRequireRequest) => Promise<ComposerOperationResponse | null>;
  composerRemove: (data: ComposerRemoveRequest) => Promise<ComposerOperationResponse | null>;
  composerUpdate: (data: ComposerUpdateRequest) => Promise<ComposerOperationResponse | null>;
  composerOperating: boolean;
  // Content type creation
  createContentType: (data: ContentTypeCreateRequest) => Promise<ContentTypeCreateResponse | null>;
  creatingContentType: boolean;
  // Block content
  blocks: BlockContentResponse[];
  blocksLoading: boolean;
  fetchBlocks: (bundle: string) => Promise<void>;
  createBlock: (
    bundle: string,
    data: BlockContentCreateRequest,
  ) => Promise<BlockContentResponse | null>;
  updateBlock: (
    bundle: string,
    blockUuid: string,
    data: BlockContentUpdateRequest,
  ) => Promise<BlockContentResponse | null>;
  blocksOperating: boolean;
  // Theme scaffolding
  scaffoldTheme: (data: ThemeScaffoldRequest) => Promise<ThemeScaffoldResponse | null>;
  scaffoldingTheme: boolean;
}

/**
 * Manages the Drupal site connection for a project, including sync, Drush, content CRUD, and staging operations.
 * Resets and re-fetches all state when `projectId` changes.
 * @param projectId - The project associated with the Drupal site.
 * @returns Site info, config, sync/staging state, and functions for connect, disconnect, pull, push, Drush, and content management.
 */
export function useDrupal(projectId: string): UseDrupalReturn {
  // Stale-request guard: increments on projectId change so in-flight requests from old projects are discarded
  const requestIdRef = useRef(0);
  useEffect(() => {
    requestIdRef.current++;
  }, [projectId]);

  // Filter caching: preserve last-used filter across mutations
  const modulesFilterRef = useRef<string | undefined>(undefined);
  const themesFilterRef = useRef<string | undefined>(undefined);

  // Stale-request guards for fetch functions
  const siteRequestIdRef = useRef(0);
  const syncRequestIdRef = useRef(0);
  const stagingRequestIdRef = useRef(0);

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

  // Module/Theme state
  const [modules, setModules] = useState<ModuleThemeListItem[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [themes, setThemes] = useState<ModuleThemeListItem[]>([]);
  const [themesLoading, setThemesLoading] = useState(false);
  const [modulesOperating, setModulesOperating] = useState(false);
  const [themesOperating, setThemesOperating] = useState(false);

  // Composer state
  const [composerOperating, setComposerOperating] = useState(false);

  // Content type creation state
  const [creatingContentType, setCreatingContentType] = useState(false);

  // Block content state
  const [blocks, setBlocks] = useState<BlockContentResponse[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksOperating, setBlocksOperating] = useState(false);

  // Theme scaffolding state
  const [scaffoldingTheme, setScaffoldingTheme] = useState(false);

  const fetchSite = useCallback(async () => {
    if (!projectId) return;
    const id = ++siteRequestIdRef.current;
    try {
      setSiteLoading(true);
      setError(null);
      const data = await getClient().getDrupalSite(projectId);
      if (id !== siteRequestIdRef.current) return;
      setSite(data);
    } catch {
      if (id !== siteRequestIdRef.current) return;
      setSite(null);
    } finally {
      if (id === siteRequestIdRef.current) setSiteLoading(false);
    }
  }, [projectId]);

  const fetchSyncStatus = useCallback(async () => {
    if (!projectId) return;
    const id = ++syncRequestIdRef.current;
    try {
      setSyncLoading(true);
      const data = await getClient().getDrupalSyncStatus(projectId);
      if (id !== syncRequestIdRef.current) return;
      setSyncStatus(data);
    } catch {
      // ignore
    } finally {
      if (id === syncRequestIdRef.current) setSyncLoading(false);
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
    setModules([]);
    setModulesLoading(false);
    setModulesOperating(false);
    setThemes([]);
    setThemesLoading(false);
    setThemesOperating(false);
    setBlocks([]);
    setBlocksLoading(false);
    setBlocksOperating(false);
    setComposerOperating(false);
    setCreatingContentType(false);
    setScaffoldingTheme(false);
    setStagingStatus(null);
    modulesFilterRef.current = undefined;
    themesFilterRef.current = undefined;
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
    [projectId, refresh],
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
    [projectId],
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
    const rid = requestIdRef.current;
    try {
      setContentTypesLoading(true);
      setError(null);
      const data = await getClient().getDrupalContentTypes(projectId);
      if (requestIdRef.current !== rid) return;
      setContentTypes(data);
    } catch (err) {
      if (requestIdRef.current !== rid) return;
      setError(extractErrorMessage(err, "Failed to load content types"));
    } finally {
      if (requestIdRef.current === rid) setContentTypesLoading(false);
    }
  }, [projectId]);

  const fetchNodes = useCallback(
    async (bundle: string) => {
      const rid = requestIdRef.current;
      try {
        setNodesLoading(true);
        setError(null);
        const data = await getClient().listDrupalContent(projectId, bundle);
        if (requestIdRef.current !== rid) return;
        setNodes(data.nodes);
      } catch (err) {
        if (requestIdRef.current !== rid) return;
        setError(extractErrorMessage(err, "Failed to load content"));
      } finally {
        if (requestIdRef.current === rid) setNodesLoading(false);
      }
    },
    [projectId],
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
    [projectId, fetchNodes],
  );

  const updateNode = useCallback(
    async (
      bundle: string,
      nodeUuid: string,
      data: DrupalNodeUpdateRequest,
    ): Promise<DrupalNode> => {
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
    [projectId, fetchNodes],
  );

  // Auto-fetch content types when site is connected
  useEffect(() => {
    if (siteConnected) {
      fetchContentTypes();
    }
  }, [siteConnected, fetchContentTypes]);

  // Staging methods

  const fetchStagingStatus = useCallback(async () => {
    if (!projectId) return;
    const id = ++stagingRequestIdRef.current;
    try {
      setStagingLoading(true);
      const data = await getClient().getDrupalStagingStatus(projectId);
      if (id !== stagingRequestIdRef.current) return;
      setStagingStatus(data);
    } catch {
      // ignore — staging may not be configured
    } finally {
      if (id === stagingRequestIdRef.current) setStagingLoading(false);
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
    [projectId, fetchStagingStatus],
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
    [projectId, fetchSyncStatus, fetchStagingStatus],
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

  // Module/Theme management

  const fetchModules = useCallback(
    async (statusFilter?: string) => {
      const rid = requestIdRef.current;
      if (statusFilter !== undefined) modulesFilterRef.current = statusFilter;
      const filter = statusFilter ?? modulesFilterRef.current;
      try {
        setModulesLoading(true);
        setError(null);
        const data = await getClient().listDrupalModules(projectId, filter);
        if (requestIdRef.current !== rid) return;
        setModules(data.items);
      } catch (err) {
        if (requestIdRef.current !== rid) return;
        setError(extractErrorMessage(err, "Failed to load modules"));
      } finally {
        if (requestIdRef.current === rid) setModulesLoading(false);
      }
    },
    [projectId],
  );

  const fetchThemes = useCallback(
    async (statusFilter?: string) => {
      const rid = requestIdRef.current;
      if (statusFilter !== undefined) themesFilterRef.current = statusFilter;
      const filter = statusFilter ?? themesFilterRef.current;
      try {
        setThemesLoading(true);
        setError(null);
        const data = await getClient().listDrupalThemes(projectId, filter);
        if (requestIdRef.current !== rid) return;
        setThemes(data.items);
      } catch (err) {
        if (requestIdRef.current !== rid) return;
        setError(extractErrorMessage(err, "Failed to load themes"));
      } finally {
        if (requestIdRef.current === rid) setThemesLoading(false);
      }
    },
    [projectId],
  );

  const enableModules = useCallback(
    async (data: ModuleEnableRequest): Promise<DrushOperationResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setModulesOperating(true);
        setError(null);
        const result = await getClient().enableDrupalModules(projectId, data);
        if (requestIdRef.current !== rid) return null;
        await fetchModules();
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Failed to enable modules"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setModulesOperating(false);
      }
    },
    [projectId, fetchModules],
  );

  const disableModules = useCallback(
    async (data: ModuleDisableRequest): Promise<DrushOperationResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setModulesOperating(true);
        setError(null);
        const result = await getClient().disableDrupalModules(projectId, data);
        if (requestIdRef.current !== rid) return null;
        await fetchModules();
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Failed to disable modules"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setModulesOperating(false);
      }
    },
    [projectId, fetchModules],
  );

  const enableTheme = useCallback(
    async (data: ThemeEnableRequest): Promise<DrushOperationResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setThemesOperating(true);
        setError(null);
        const result = await getClient().enableDrupalTheme(projectId, data);
        if (requestIdRef.current !== rid) return null;
        await fetchThemes();
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Failed to enable theme"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setThemesOperating(false);
      }
    },
    [projectId, fetchThemes],
  );

  const disableTheme = useCallback(
    async (data: ThemeDisableRequest): Promise<DrushOperationResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setThemesOperating(true);
        setError(null);
        const result = await getClient().disableDrupalTheme(projectId, data);
        if (requestIdRef.current !== rid) return null;
        await fetchThemes();
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Failed to disable theme"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setThemesOperating(false);
      }
    },
    [projectId, fetchThemes],
  );

  // Composer operations

  const composerRequire = useCallback(
    async (data: ComposerRequireRequest): Promise<ComposerOperationResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setComposerOperating(true);
        setError(null);
        const result = await getClient().composerRequire(projectId, data);
        if (requestIdRef.current !== rid) return null;
        await fetchModules();
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Composer require failed"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setComposerOperating(false);
      }
    },
    [projectId, fetchModules],
  );

  const composerRemove = useCallback(
    async (data: ComposerRemoveRequest): Promise<ComposerOperationResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setComposerOperating(true);
        setError(null);
        const result = await getClient().composerRemove(projectId, data);
        if (requestIdRef.current !== rid) return null;
        await fetchModules();
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Composer remove failed"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setComposerOperating(false);
      }
    },
    [projectId, fetchModules],
  );

  const composerUpdate = useCallback(
    async (data: ComposerUpdateRequest): Promise<ComposerOperationResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setComposerOperating(true);
        setError(null);
        const result = await getClient().composerUpdate(projectId, data);
        if (requestIdRef.current !== rid) return null;
        await fetchModules();
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Composer update failed"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setComposerOperating(false);
      }
    },
    [projectId, fetchModules],
  );

  // Content type creation

  const createContentType = useCallback(
    async (data: ContentTypeCreateRequest): Promise<ContentTypeCreateResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setCreatingContentType(true);
        setError(null);
        const result = await getClient().createDrupalContentType(projectId, data);
        if (requestIdRef.current !== rid) return null;
        await fetchContentTypes();
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Failed to create content type"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setCreatingContentType(false);
      }
    },
    [projectId, fetchContentTypes],
  );

  // Block content management

  const fetchBlocks = useCallback(
    async (bundle: string) => {
      const rid = requestIdRef.current;
      try {
        setBlocksLoading(true);
        setError(null);
        const data = await getClient().listDrupalBlocks(projectId, bundle);
        if (requestIdRef.current !== rid) return;
        setBlocks(data.blocks);
      } catch (err) {
        if (requestIdRef.current !== rid) return;
        setError(extractErrorMessage(err, "Failed to load blocks"));
      } finally {
        if (requestIdRef.current === rid) setBlocksLoading(false);
      }
    },
    [projectId],
  );

  const createBlock = useCallback(
    async (
      bundle: string,
      data: BlockContentCreateRequest,
    ): Promise<BlockContentResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setBlocksOperating(true);
        setError(null);
        const result = await getClient().createDrupalBlock(projectId, bundle, data);
        if (requestIdRef.current !== rid) return null;
        await fetchBlocks(bundle);
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Failed to create block"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setBlocksOperating(false);
      }
    },
    [projectId, fetchBlocks],
  );

  const updateBlock = useCallback(
    async (
      bundle: string,
      blockUuid: string,
      data: BlockContentUpdateRequest,
    ): Promise<BlockContentResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setBlocksOperating(true);
        setError(null);
        const result = await getClient().updateDrupalBlock(projectId, bundle, blockUuid, data);
        if (requestIdRef.current !== rid) return null;
        await fetchBlocks(bundle);
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Failed to update block"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setBlocksOperating(false);
      }
    },
    [projectId, fetchBlocks],
  );

  // Theme scaffolding

  const scaffoldTheme = useCallback(
    async (data: ThemeScaffoldRequest): Promise<ThemeScaffoldResponse | null> => {
      const rid = requestIdRef.current;
      try {
        setScaffoldingTheme(true);
        setError(null);
        const result = await getClient().scaffoldDrupalTheme(projectId, data);
        if (requestIdRef.current !== rid) return null;
        await fetchThemes();
        return result;
      } catch (err) {
        if (requestIdRef.current !== rid) return null;
        setError(extractErrorMessage(err, "Failed to scaffold theme"));
        return null;
      } finally {
        if (requestIdRef.current === rid) setScaffoldingTheme(false);
      }
    },
    [projectId, fetchThemes],
  );

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
    // Module/Theme management
    modules,
    modulesLoading,
    themes,
    themesLoading,
    fetchModules,
    fetchThemes,
    enableModules,
    disableModules,
    enableTheme,
    disableTheme,
    modulesOperating,
    themesOperating,
    // Composer
    composerRequire,
    composerRemove,
    composerUpdate,
    composerOperating,
    // Content type creation
    createContentType,
    creatingContentType,
    // Block content
    blocks,
    blocksLoading,
    fetchBlocks,
    createBlock,
    updateBlock,
    blocksOperating,
    // Theme scaffolding
    scaffoldTheme,
    scaffoldingTheme,
  };
}
