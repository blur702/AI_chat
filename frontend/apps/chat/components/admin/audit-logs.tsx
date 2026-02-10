"use client";

import { useState } from "react";
import { Button } from "@workstation/ui";
import {
  AlertCircle,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { useAuditLogs } from "@workstation/api/hooks";
import type { AuditLogEntry } from "@workstation/api/types";
import { AuditLogFiltersBar } from "./audit-log-filters";
import { AuditLogTable } from "./audit-log-table";
import { AuditLogDetailsModal } from "./audit-log-details-modal";

const STATUS_LEGEND = [
  { label: "Success", className: "bg-green-500" },
  { label: "Failure", className: "bg-red-500" },
  { label: "Error", className: "bg-orange-500" },
];

export function AuditLogs() {
  const {
    logs,
    loading,
    error,
    total,
    page,
    pageSize,
    filters,
    setPage,
    setFilters,
    resetFilters,
    refresh,
    exportLogs,
    exporting,
  } = useAuditLogs();

  const [detailsLog, setDetailsLog] = useState<AuditLogEntry | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSort = (field: string) => {
    if (filters.sort_by === field) {
      setFilters({ order: filters.order === "asc" ? "desc" : "asc" });
    } else {
      setFilters({ sort_by: field, order: "desc" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Audit Logs</h2>
          <span className="text-xs text-muted-foreground">
            ({total} total)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => exportLogs("csv")}
            disabled={exporting || total === 0}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => exportLogs("json")}
            disabled={exporting || total === 0}
          >
            <FileJson className="h-3.5 w-3.5 mr-1" />
            JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <AuditLogFiltersBar
        filters={filters}
        onFilterChange={setFilters}
        onReset={resetFilters}
      />

      <AuditLogTable
        logs={logs}
        filters={filters}
        onSort={handleSort}
        onViewDetails={(log) => setDetailsLog(log)}
        loading={loading}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total} entries)
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </Button>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, idx) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = idx + 1;
              } else if (page <= 4) {
                pageNum = idx + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + idx;
              } else {
                pageNum = page - 3 + idx;
              }
              return (
                <Button
                  key={pageNum}
                  size="sm"
                  variant={page === pageNum ? "secondary" : "ghost"}
                  onClick={() => setPage(pageNum)}
                  className="w-8"
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
        <span className="font-medium">Status Legend:</span>
        {STATUS_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${item.className}`}
            />
            {item.label}
          </div>
        ))}
      </div>

      {/* Details Modal */}
      <AuditLogDetailsModal
        log={detailsLog}
        open={detailsLog !== null}
        onClose={() => setDetailsLog(null)}
      />
    </div>
  );
}
