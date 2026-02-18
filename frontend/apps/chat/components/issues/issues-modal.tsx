"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { Button, Badge, ScrollArea } from "@workstation/ui";
import { Bug, X, ExternalLink, Check, Trash2, Wrench } from "lucide-react";
import { useIssuesPanel } from "./issues-provider";
import { useIssues } from "@workstation/api/hooks/use-issues";
import { useProjects } from "@workstation/api/hooks/use-projects";
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

export function IssuesModal() {
  const { isOpen, closeIssues } = useIssuesPanel();
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { issues, count, loading, error, updateIssue, deleteIssue, startFix } = useIssues({
    project_id: projectFilter === "all" ? undefined : projectFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const { projects } = useProjects();
  const titleId = useId();

  // Drag state (matching notes-modal pattern)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isOpen) setPosition(null);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    draggingRef.current = true;

    const onPointerMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const panelW = panel.offsetWidth;
      const panelH = panel.offsetHeight;
      const maxX = Math.max(0, window.innerWidth - panelW);
      const maxY = Math.max(0, window.innerHeight - panelH);
      setPosition({
        x: Math.max(0, Math.min(maxX, ev.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(maxY, ev.clientY - dragOffset.current.y)),
      });
    };

    const cleanup = () => {
      draggingRef.current = false;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", cleanup);
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", cleanup);
  }, []);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeIssues();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, closeIssues]);

  const handleResolve = useCallback(
    async (id: string) => {
      await updateIssue(id, { status: "resolved" });
    },
    [updateIssue],
  );

  const handleStartFix = useCallback(
    async (issue: IssueResponse) => {
      const result = await startFix(issue.id);
      const event = new CustomEvent("workspace:inject-message", {
        detail: {
          content: `Fix issue: "${issue.title}"\n\nBranch: ${result.branch}\nSeverity: ${issue.severity}\n\n${issue.description || "No description"}`,
        },
      });
      window.dispatchEvent(event);
    },
    [startFix],
  );

  if (!isOpen) return null;

  const panelStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : { right: 16, top: 56 };

  const modal = (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={(e) => {
          e.stopPropagation();
          closeIssues();
        }}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed z-[51] flex w-full max-w-lg flex-col rounded-lg border bg-background shadow-lg"
        style={{ ...panelStyle, maxHeight: "80vh" }}
      >
        {/* Header / drag handle */}
        <div
          className="flex cursor-grab select-none items-center justify-between border-b px-4 py-2.5 active:cursor-grabbing"
          onPointerDown={handlePointerDown}
        >
          <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold">
            <Bug className="h-4 w-4" />
            Issues
            {count > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {count}
              </Badge>
            )}
          </h2>
          <button
            type="button"
            onClick={closeIssues}
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close issues"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 border-b px-4 py-2">
          <select
            className="h-7 rounded-md border bg-background px-2 text-xs"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
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

        {/* Content */}
        <ScrollArea className="min-h-0 flex-1 px-4 py-2" style={{ maxHeight: "60vh" }}>
          {loading && issues.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Loading...</p>
          )}
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
                    {issue.project_name && (
                      <p className="text-[10px] text-muted-foreground">{issue.project_name}</p>
                    )}
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
                      onClick={() => window.open(issue.fix_pr_url!, "_blank")}
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
                    onClick={() => deleteIssue(issue.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
