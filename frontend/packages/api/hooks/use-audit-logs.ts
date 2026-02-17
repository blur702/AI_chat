"use client";

import { useCallback, useEffect, useState } from "react";
import { getClient } from "../client";
import type { AuditLogEntry, AuditLogFilters } from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseAuditLogsReturn {
  logs: AuditLogEntry[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  pageSize: number;
  filters: AuditLogFilters;
  setPage: (page: number) => void;
  setFilters: (filters: Partial<AuditLogFilters>) => void;
  resetFilters: () => void;
  refresh: () => Promise<void>;
  exportLogs: (format: "csv" | "json") => Promise<void>;
  exporting: boolean;
}

const DEFAULT_PAGE_SIZE = 50;

const DEFAULT_FILTERS: AuditLogFilters = {
  sort_by: "created_at",
  order: "desc",
  page: 1,
  page_size: DEFAULT_PAGE_SIZE,
};

/**
 * Fetches paginated audit log entries with filtering, sorting, and CSV/JSON export support.
 * @returns Audit log list, pagination state, filter controls, and an `exportLogs` function.
 */
export function useAuditLogs(): UseAuditLogsReturn {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [filters, setFiltersState] = useState<AuditLogFilters>(DEFAULT_FILTERS);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClient().getAuditLogs({
        ...filters,
        page,
        page_size: DEFAULT_PAGE_SIZE,
      });
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load audit logs"));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  const setPage = useCallback((p: number) => {
    setPageState(Math.max(1, p));
  }, []);

  const setFilters = useCallback((partial: Partial<AuditLogFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
    setPageState(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setPageState(1);
  }, []);

  const exportLogs = useCallback(
    async (format: "csv" | "json") => {
      setExporting(true);
      setError(null);
      try {
        const blob = await getClient().exportAuditLogs(filters, format);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `audit_logs.${format}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to export audit logs"));
      } finally {
        setExporting(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    logs,
    loading,
    error,
    total,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    filters,
    setPage,
    setFilters,
    resetFilters,
    refresh,
    exportLogs,
    exporting,
  };
}
