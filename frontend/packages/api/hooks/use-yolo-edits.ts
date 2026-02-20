"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type { YoloEdit } from "../types";
import { extractErrorMessage } from "../utils/error";

/**
 * Fetches the most recent YOLO code edits for a project and provides an `undo` function per edit.
 * @param projectId - The project whose YOLO edits to list.
 * @returns Edit list, undoable count, loading/error state, and `undo`/`refresh` callbacks.
 */
export function useYoloEdits(projectId: string) {
  const [edits, setEdits] = useState<YoloEdit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().listYoloEdits(projectId, { limit: 50 });
      setEdits(res.edits);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load edits"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const undo = useCallback(
    async (editId: string) => {
      try {
        setError(null);
        const result = await getClient().undoYoloEdit(editId);
        await refresh();
        return result;
      } catch (err) {
        const message = extractErrorMessage(err, "Failed to undo edit");
        setError(message);
        throw err;
      }
    },
    [refresh]
  );

  const undoableCount = edits.filter((e) => !e.undo_performed).length;

  return {
    edits,
    loading,
    error,
    undoableCount,
    refresh,
    undo,
  };
}
