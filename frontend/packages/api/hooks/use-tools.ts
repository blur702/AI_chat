"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { ToolInfo, ToolExecuteRequest, ToolExecuteResponse } from "../types";

interface UseToolsReturn {
  tools: ToolInfo[];
  loading: boolean;
  error: string | null;
  executeTool: (request: ToolExecuteRequest) => Promise<ToolExecuteResponse>;
  refresh: () => Promise<void>;
}

export function useTools(): UseToolsReturn {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getClient().listTools();
      setTools(result.tools);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tools");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const executeTool = useCallback(
    async (request: ToolExecuteRequest): Promise<ToolExecuteResponse> => {
      return getClient().executeTool(request);
    },
    []
  );

  return { tools, loading, error, executeTool, refresh };
}
