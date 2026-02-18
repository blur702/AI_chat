"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button, Badge, ScrollArea } from "@workstation/ui";
import { Bug, ExternalLink, Check, Trash2, Wrench, X } from "lucide-react";
import { useIssues } from "@workstation/api/hooks/use-issues";
import type { IssueResponse } from "@workstation/api/types";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-blue-400 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  fix_pending_review: "Pending Review",
  resolved: "Resolved",
  closed: "Closed",
};

interface IssuesPanelProps {
  projectId: string;
  onClose: () => void;
}

export function IssuesPanel({ projectId, onClose }: IssuesPanelProps) {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const scannedRef = useRef<string | null>(null);

  const { issues, loading, error, refresh, updateIssue, deleteIssue, startFix, scanProjectIssues } =
    useIssues({
      project_id: projectId,
      status: statusFilter === "all" ? undefined : statusFilter,
      severity: severityFilter === "all" ? undefined : severityFilter,
    });

  // Auto-scan on mount
  useEffect(() => {
    if (scannedRef.current !== projectId) {
      scannedRef.current = projectId;
      scanProjectIssues(projectId).catch(() => {});
    }
  }, [projectId, scanProjectIssues]);

  const handleStartFix = useCallback(
    async (issue: IssueResponse) => {
      try {
        const result = await startFix(issue.id);
        // Dispatch custom event to inject fix request into chat
        const event = new CustomEvent("workspace:inject-message", {
          detail: {
            content: `Fix issue: "${issue.title}"\n\nBranch: ${result.branch}\nSeverity: ${issue.severity}\n\n${issue.description || "No description"}\n\n${issue.reproduction_steps ? `Reproduction steps:\n${issue.reproduction_steps}` : ""}`,
          },
        });
        window.dispatchEvent(event);
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.warn("startFix failed:", err);
      }
    },
    [startFix],
  );

  const handleResolve = useCallback(
    async (id: string) => {
      try {
        await updateIssue(id, { status: "resolved" });
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.warn("resolve failed:", err);
      }
    },
    [updateIssue],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteIssue(id);
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.warn("delete failed:", err);
      }
    },
    [deleteIssue],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bug className="h-4 w-4" />
          Issues
        </h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close issues panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1.5 border-b px-4 py-2">
        <select
          aria-label="Filter by severity"
          className="h-7 rounded-md border bg-background px-2 text-xs"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          aria-label="Filter by status"
          className="h-7 rounded-md border bg-background px-2 text-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="fix_pending_review">Pending Review</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <ScrollArea className="flex-1 px-4 py-2">
        {loading && <p className="py-4 text-center text-xs text-muted-foreground">Loading...</p>}
        {error && <p className="py-4 text-center text-xs text-destructive">{error}</p>}
        {!loading && issues.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">No issues found</p>
        )}
        <div className="flex flex-col gap-2">
          {issues.map((issue) => (
            <div key={issue.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start gap-2">
                <Badge
                  className={`h-4 shrink-0 text-[10px] ${SEVERITY_COLORS[issue.severity] || ""}`}
                >
                  {issue.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{issue.title}</p>
                  {issue.description && (
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                      {issue.description}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="h-4 shrink-0 text-[10px]">
                  {STATUS_LABELS[issue.status] || issue.status}
                </Badge>
              </div>

              <div className="mt-2 flex items-center gap-1">
                {issue.status === "open" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 text-[10px]"
                    onClick={() => handleStartFix(issue)}
                  >
                    <Wrench className="h-3 w-3" />
                    Fix this
                  </Button>
                )}
                {issue.fix_pr_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 text-[10px]"
                    onClick={() => {
                      try {
                        const parsed = new URL(issue.fix_pr_url!);
                        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                          window.open(issue.fix_pr_url!, "_blank", "noopener,noreferrer");
                        }
                      } catch { /* invalid URL */ }
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View PR
                  </Button>
                )}
                {(issue.status === "open" || issue.status === "in_progress") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 text-[10px]"
                    onClick={() => handleResolve(issue.id)}
                  >
                    <Check className="h-3 w-3" />
                    Resolve
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-6 w-6 text-destructive"
                  onClick={() => handleDelete(issue.id)}
                  aria-label="Delete issue"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
