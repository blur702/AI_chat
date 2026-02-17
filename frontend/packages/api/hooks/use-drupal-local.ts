"use client";

import { useState, useCallback, useMemo } from "react";
import { getClient } from "../client";
import type {
  DrupalLocalFileNode,
  DrupalLocalFileContent,
  DrupalLocalModuleInfo,
  DrupalLocalThemeInfo,
  DrupalLocalDrushResponse,
  DrupalLocalSiteStatus,
  DrupalLocalConfigStatus,
  DrupalLocalDrushResult,
  DrupalLocalModuleScaffoldResponse,
  PaletteResponse,
  PaletteGenerateRequest,
} from "../types";

export interface UseDrupalLocalReturn {
  // File tree
  files: DrupalLocalFileNode[];
  fileTreeLoading: boolean;
  loadFileTree: (path?: string) => Promise<void>;

  // File content
  activeFile: DrupalLocalFileContent | null;
  fileLoading: boolean;
  openFile: (path: string) => Promise<void>;
  saveFile: (path: string, content: string) => Promise<void>;
  createFile: (path: string, content?: string) => Promise<void>;
  createDirectory: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;

  // Drush
  drushHistory: DrupalLocalDrushResponse[];
  drushLoading: boolean;
  runDrush: (command: string) => Promise<DrupalLocalDrushResponse>;

  // Modules / Themes
  modules: DrupalLocalModuleInfo[];
  themes: DrupalLocalThemeInfo[];
  modulesLoading: boolean;
  themesLoading: boolean;
  loadModules: () => Promise<void>;
  loadThemes: () => Promise<void>;
  scaffoldModule: (data: { machine_name: string; name: string; description?: string; package?: string }) => Promise<DrupalLocalModuleScaffoldResponse>;

  // Status / Config
  siteStatus: DrupalLocalSiteStatus | null;
  configStatus: DrupalLocalConfigStatus | null;
  statusLoading: boolean;
  loadStatus: () => Promise<void>;
  loadConfigStatus: () => Promise<void>;
  exportConfig: () => Promise<DrupalLocalDrushResult>;
  importConfig: () => Promise<DrupalLocalDrushResult>;

  // Palette
  palette: PaletteResponse | null;
  paletteLoading: boolean;
  generatePalette: (data: PaletteGenerateRequest) => Promise<PaletteResponse>;
  validatePalette: (colors: string[]) => Promise<PaletteResponse>;
  adjustPalette: (colors: string[]) => Promise<PaletteResponse>;

  // Error
  error: string | null;
}

export function useDrupalLocal(): UseDrupalLocalReturn {
  const [files, setFiles] = useState<DrupalLocalFileNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  const [activeFile, setActiveFile] = useState<DrupalLocalFileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [drushHistory, setDrushHistory] = useState<DrupalLocalDrushResponse[]>([]);
  const [drushLoading, setDrushLoading] = useState(false);
  const [modules, setModules] = useState<DrupalLocalModuleInfo[]>([]);
  const [themes, setThemes] = useState<DrupalLocalThemeInfo[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [themesLoading, setThemesLoading] = useState(false);
  const [siteStatus, setSiteStatus] = useState<DrupalLocalSiteStatus | null>(null);
  const [configStatus, setConfigStatus] = useState<DrupalLocalConfigStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [palette, setPalette] = useState<PaletteResponse | null>(null);
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = getClient();

  const loadFileTree = useCallback(async (path?: string) => {
    setFileTreeLoading(true);
    setError(null);
    try {
      const res = await client.getDrupalLocalFiles(path);
      setFiles(res.files);
    } catch (e: any) {
      setError(e.message || "Failed to load files");
    } finally {
      setFileTreeLoading(false);
    }
  }, [client]);

  const openFile = useCallback(async (path: string) => {
    setFileLoading(true);
    setError(null);
    try {
      const res = await client.getDrupalLocalFileContent(path);
      setActiveFile(res);
    } catch (e: any) {
      setError(e.message || "Failed to open file");
    } finally {
      setFileLoading(false);
    }
  }, [client]);

  const saveFile = useCallback(async (path: string, content: string) => {
    setError(null);
    try {
      await client.updateDrupalLocalFile(path, content);
      // Update active file in place
      setActiveFile((prev) => prev && prev.path === path ? { ...prev, content } : prev);
    } catch (e: any) {
      setError(e.message || "Failed to save file");
      throw e;
    }
  }, [client]);

  const createFile = useCallback(async (path: string, content?: string) => {
    setError(null);
    try {
      await client.createDrupalLocalFile(path, content);
    } catch (e: any) {
      setError(e.message || "Failed to create file");
      throw e;
    }
  }, [client]);

  const createDirectory = useCallback(async (path: string) => {
    setError(null);
    try {
      await client.createDrupalLocalDirectory(path);
    } catch (e: any) {
      setError(e.message || "Failed to create directory");
      throw e;
    }
  }, [client]);

  const deleteFile = useCallback(async (path: string) => {
    setError(null);
    try {
      await client.deleteDrupalLocalFile(path);
      // If deleted file is active, clear it
      setActiveFile((prev) => prev && prev.path === path ? null : prev);
    } catch (e: any) {
      setError(e.message || "Failed to delete");
      throw e;
    }
  }, [client]);

  const renameFile = useCallback(async (oldPath: string, newPath: string) => {
    setError(null);
    try {
      await client.renameDrupalLocalFile(oldPath, newPath);
    } catch (e: any) {
      setError(e.message || "Failed to rename");
      throw e;
    }
  }, [client]);

  const runDrush = useCallback(async (command: string) => {
    setDrushLoading(true);
    setError(null);
    try {
      const res = await client.runDrupalLocalDrush(command);
      setDrushHistory((prev) => [...prev, res]);
      return res;
    } catch (e: any) {
      setError(e.message || "Drush command failed");
      throw e;
    } finally {
      setDrushLoading(false);
    }
  }, [client]);

  const loadModules = useCallback(async () => {
    setModulesLoading(true);
    setError(null);
    try {
      const res = await client.getDrupalLocalModules();
      setModules(res.modules);
    } catch (e: any) {
      setError(e.message || "Failed to load modules");
    } finally {
      setModulesLoading(false);
    }
  }, [client]);

  const loadThemes = useCallback(async () => {
    setThemesLoading(true);
    setError(null);
    try {
      const res = await client.getDrupalLocalThemes();
      setThemes(res.themes);
    } catch (e: any) {
      setError(e.message || "Failed to load themes");
    } finally {
      setThemesLoading(false);
    }
  }, [client]);

  const scaffoldModule = useCallback(async (data: { machine_name: string; name: string; description?: string; package?: string }) => {
    setError(null);
    try {
      return await client.scaffoldDrupalLocalModule(data);
    } catch (e: any) {
      setError(e.message || "Failed to scaffold module");
      throw e;
    }
  }, [client]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setError(null);
    try {
      const res = await client.getDrupalLocalStatus();
      setSiteStatus(res);
    } catch (e: any) {
      setError(e.message || "Failed to load status");
    } finally {
      setStatusLoading(false);
    }
  }, [client]);

  const loadConfigStatus = useCallback(async () => {
    setStatusLoading(true);
    setError(null);
    try {
      const res = await client.getDrupalLocalConfigStatus();
      setConfigStatus(res);
    } catch (e: any) {
      setError(e.message || "Failed to load config status");
    } finally {
      setStatusLoading(false);
    }
  }, [client]);

  const exportConfig = useCallback(async () => {
    setError(null);
    try {
      return await client.exportDrupalLocalConfig();
    } catch (e: any) {
      setError(e.message || "Config export failed");
      throw e;
    }
  }, [client]);

  const importConfig = useCallback(async () => {
    setError(null);
    try {
      return await client.importDrupalLocalConfig();
    } catch (e: any) {
      setError(e.message || "Config import failed");
      throw e;
    }
  }, [client]);

  const generatePalette = useCallback(async (data: PaletteGenerateRequest) => {
    setPaletteLoading(true);
    setError(null);
    try {
      const res = await client.generatePalette(data);
      setPalette(res);
      return res;
    } catch (e: any) {
      setError(e.message || "Palette generation failed");
      throw e;
    } finally {
      setPaletteLoading(false);
    }
  }, [client]);

  const validatePalette = useCallback(async (colors: string[]) => {
    setPaletteLoading(true);
    setError(null);
    try {
      const res = await client.validatePalette(colors);
      setPalette(res);
      return res;
    } catch (e: any) {
      setError(e.message || "Palette validation failed");
      throw e;
    } finally {
      setPaletteLoading(false);
    }
  }, [client]);

  const adjustPalette = useCallback(async (colors: string[]) => {
    setPaletteLoading(true);
    setError(null);
    try {
      const res = await client.adjustPalette(colors);
      setPalette(res);
      return res;
    } catch (e: any) {
      setError(e.message || "Palette adjustment failed");
      throw e;
    } finally {
      setPaletteLoading(false);
    }
  }, [client]);

  return useMemo(() => ({
    files, fileTreeLoading, loadFileTree,
    activeFile, fileLoading, openFile, saveFile,
    createFile, createDirectory, deleteFile, renameFile,
    drushHistory, drushLoading, runDrush,
    modules, themes, modulesLoading, themesLoading,
    loadModules, loadThemes, scaffoldModule,
    siteStatus, configStatus, statusLoading,
    loadStatus, loadConfigStatus, exportConfig, importConfig,
    palette, paletteLoading, generatePalette, validatePalette, adjustPalette,
    error,
  }), [
    files, fileTreeLoading, loadFileTree,
    activeFile, fileLoading, openFile, saveFile,
    createFile, createDirectory, deleteFile, renameFile,
    drushHistory, drushLoading, runDrush,
    modules, themes, modulesLoading, themesLoading,
    loadModules, loadThemes, scaffoldModule,
    siteStatus, configStatus, statusLoading,
    loadStatus, loadConfigStatus, exportConfig, importConfig,
    palette, paletteLoading, generatePalette, validatePalette, adjustPalette,
    error,
  ]);
}
