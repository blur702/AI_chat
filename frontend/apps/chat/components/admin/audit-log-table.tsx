"use client";

import { Fragment, useState } from "react";
import { Button, Badge, cn } from "@workstation/ui";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import type { AuditLogEntry, AuditLogFilters } from "@workstation/api/types";

interface AuditLogTableProps {
  logs: AuditLogEntry[];
  filters: AuditLogFilters;
  onSort: (field: string) => void;
  onViewDetails: (log: AuditLogEntry) => void;
  loading: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-green-500/10 text-green-600 border-green-500/20",
  failure: "bg-red-500/10 text-red-600 border-red-500/20",
  error: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

function SortIcon({
  field,
  currentSort,
  currentOrder,
}: {
  field: string;
  currentSort?: string;
  currentOrder?: string;
}) {
  if (currentSort !== field) {
    return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/50" />;
  }
  return currentOrder === "asc" ? (
    <ArrowUp className="h-3 w-3 ml-1" />
  ) : (
    <ArrowDown className="h-3 w-3 ml-1" />
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export function AuditLogTable({
  logs,
  filters,
  onSort,
  onViewDetails,
  loading,
}: AuditLogTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading audit logs...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
        <p className="text-sm text-muted-foreground">No audit logs found</p>
        <p className="text-xs text-muted-foreground/70">
          Adjust your filters or wait for new events.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 text-left font-medium">
                <button
                  className="flex items-center hover:text-foreground"
                  onClick={() => onSort("created_at")}
                >
                  Timestamp
                  <SortIcon
                    field="created_at"
                    currentSort={filters.sort_by}
                    currentOrder={filters.order}
                  />
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium">User</th>
              <th className="px-3 py-2 text-left font-medium">
                <button
                  className="flex items-center hover:text-foreground"
                  onClick={() => onSort("action")}
                >
                  Action
                  <SortIcon
                    field="action"
                    currentSort={filters.sort_by}
                    currentOrder={filters.order}
                  />
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button
                  className="flex items-center hover:text-foreground"
                  onClick={() => onSort("status")}
                >
                  Status
                  <SortIcon
                    field="status"
                    currentSort={filters.sort_by}
                    currentOrder={filters.order}
                  />
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button
                  className="flex items-center hover:text-foreground"
                  onClick={() => onSort("ip_address")}
                >
                  IP Address
                  <SortIcon
                    field="ip_address"
                    currentSort={filters.sort_by}
                    currentOrder={filters.order}
                  />
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium">Resource</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const isExpanded = expandedIds.has(log.id);
              const statusStyle =
                STATUS_STYLES[log.status] ?? "bg-muted text-muted-foreground";

              return (
                <Fragment key={log.id}>
                  <tr
                    className={cn(
                      "border-b hover:bg-muted/30 transition-colors cursor-pointer",
                      isExpanded && "bg-muted/20"
                    )}
                    onClick={() => toggleExpand(log.id)}
                  >
                    <td className="px-2 py-2 text-center">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {log.username ?? (
                        <span className="text-muted-foreground italic">
                          system
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">
                      {log.action}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] capitalize", statusStyle)}
                      >
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-muted-foreground">
                      {log.ip_address ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]">
                      {log.resource ?? "-"}
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails(log);
                        }}
                        aria-label="View details"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b bg-muted/10">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                            <div>
                              <span className="font-medium text-muted-foreground">
                                User Agent:
                              </span>
                              <p className="text-muted-foreground/80 break-all mt-0.5">
                                {log.user_agent ?? "N/A"}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground">
                                Log ID:
                              </span>
                              <p className="font-mono text-muted-foreground/80 mt-0.5">
                                {log.id}
                              </p>
                            </div>
                          </div>
                          {log.details &&
                            Object.keys(log.details).length > 0 && (
                              <div>
                                <span className="font-medium text-muted-foreground">
                                  Details:
                                </span>
                                <pre className="mt-1 rounded-md bg-muted p-2 text-[11px] overflow-x-auto max-h-[200px]">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </div>
                            )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
