"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { AutomationAction } from "../types";

export function useAutomationActions(projectId: string) {
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().listAutomationActions(projectId);
      setActions(res.actions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load actions");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const approve = useCallback(
    async (actionId: string, modifiedData?: Record<string, any>) => {
      try {
        await getClient().approveAutomationAction(actionId, modifiedData);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve action");
        throw err;
      }
    },
    [refresh]
  );

  const execute = useCallback(
    async (actionId: string) => {
      try {
        const result = await getClient().executeAutomationAction(actionId);
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to execute action");
        throw err;
      }
    },
    [refresh]
  );

  const reject = useCallback(
    async (actionId: string) => {
      try {
        await getClient().deleteAutomationAction(actionId);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reject action");
        throw err;
      }
    },
    [refresh]
  );

  const pendingCount = actions.filter(
    (a) => !a.user_approved && !a.executed_at
  ).length;

  return {
    actions,
    loading,
    error,
    pendingCount,
    refresh,
    approve,
    execute,
    reject,
  };
}
