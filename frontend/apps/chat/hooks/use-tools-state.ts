"use client";

import { useState, useCallback } from "react";
import type { ToolExecuteResponse } from "@workstation/api/types";

export interface ToolsState {
  prefillFile: string | null;
  filterForFile: boolean;
  initialTool: string | null;
  lastExecution: {
    toolName: string;
    success: boolean;
    timestamp: number;
    params: Record<string, unknown>;
  } | null;
  rerunExecution: {
    toolName: string;
    params: Record<string, unknown>;
    timestamp: number;
  } | null;
  resultsForChat: ToolExecuteResponse[];
}

export interface UseToolsStateReturn extends ToolsState {
  setPrefillFile: (file: string | null) => void;
  setFilterForFile: (filter: boolean) => void;
  setInitialTool: (tool: string | null) => void;
  handleToolExecuted: (result: ToolExecuteResponse, toolName: string, params: Record<string, unknown>) => void;
  handleRerunLastTool: () => { toolName: string; params: Record<string, unknown> } | null;
  resetToolsOpen: () => void;
  prepareRunToolOnFile: (filePath: string) => void;
  prepareQuickExecute: (toolName: string) => void;
}

export function useToolsState(): UseToolsStateReturn {
  const [prefillFile, setPrefillFile] = useState<string | null>(null);
  const [filterForFile, setFilterForFile] = useState(false);
  const [initialTool, setInitialTool] = useState<string | null>(null);
  const [lastExecution, setLastExecution] = useState<ToolsState["lastExecution"]>(null);
  const [rerunExecution, setRerunExecution] = useState<ToolsState["rerunExecution"]>(null);
  const [resultsForChat, setResultsForChat] = useState<ToolExecuteResponse[]>([]);

  const handleToolExecuted = useCallback(
    (result: ToolExecuteResponse, toolName: string, params: Record<string, unknown>) => {
      const execution = {
        toolName,
        success: result.success,
        timestamp: Date.now(),
        params,
      };
      setLastExecution(execution);
      setResultsForChat((prev) => [result, ...prev.slice(0, 9)]);
      try {
        localStorage.setItem(
          "tools:last-execution",
          JSON.stringify({ toolName, success: result.success, timestamp: execution.timestamp })
        );
      } catch { /* ignore */ }
    },
    []
  );

  const handleRerunLastTool = useCallback(() => {
    if (!lastExecution) return null;
    const rerun = {
      toolName: lastExecution.toolName,
      params: lastExecution.params,
      timestamp: Date.now(),
    };
    setRerunExecution(rerun);
    return rerun;
  }, [lastExecution]);

  const resetToolsOpen = useCallback(() => {
    setPrefillFile(null);
    setFilterForFile(false);
    setInitialTool(null);
  }, []);

  const prepareRunToolOnFile = useCallback((filePath: string) => {
    setPrefillFile(filePath);
    setFilterForFile(true);
    setInitialTool(null);
  }, []);

  const prepareQuickExecute = useCallback((toolName: string) => {
    setPrefillFile(null);
    setFilterForFile(false);
    setInitialTool(toolName);
  }, []);

  return {
    prefillFile,
    filterForFile,
    initialTool,
    lastExecution,
    rerunExecution,
    resultsForChat,
    setPrefillFile,
    setFilterForFile,
    setInitialTool,
    handleToolExecuted,
    handleRerunLastTool,
    resetToolsOpen,
    prepareRunToolOnFile,
    prepareQuickExecute,
  };
}
