"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { ToolInfo, ToolExecuteRequest, ToolExecuteResponse } from "../types";
import { extractErrorMessage } from "../utils/error";

interface UseToolsReturn {
  tools: ToolInfo[];
  loading: boolean;
  error: string | null;
  executeTool: (request: ToolExecuteRequest) => Promise<ToolExecuteResponse>;
  refresh: () => Promise<void>;
}

/**
 * Fetches the list of registered kernel tools and provides a direct `executeTool` function.
 * @returns Tool list, loading/error state, an `executeTool` function, and a `refresh` callback.
 */
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
      setError(extractErrorMessage(err, "Failed to fetch tools"));
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
