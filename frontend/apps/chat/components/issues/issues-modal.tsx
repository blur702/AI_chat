"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import {
  cn,
  Button,
  Badge,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Textarea,
} from "@workstation/ui";
import {
  Bug,
  X,
  ExternalLink,
  Check,
  Trash2,
  Wrench,
  Plus,
  ChevronDown,
  ChevronUp,
  Pencil,
  HelpCircle,
  Loader2,
  AlertTriangle,
  AlertOctagon,
  Code2,
  Save,
  XCircle,
  Download,
} from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";
import { useIssuesPanel } from "./issues-provider";
import { useIssues } from "@workstation/api/hooks/use-issues";
import { useProjects } from "@workstation/api/hooks/use-projects";
import { getClient } from "@workstation/api";
import type { IssueResponse, IssueCreateRequest } from "@workstation/api/types";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-blue-400 text-white",
};

const SEVERITY_DESCRIPTIONS: Record<string, string> = {
  low: "Minor issue, cosmetic or low-impact",
  medium: "Functional issue, workaround exists",
  high: "Major issue, blocks important functionality",
  critical: "Showstopper, system down or data loss risk",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  fix_pending_review: "Pending Review",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  open: "Reported but not yet being worked on",
  in_progress: "Actively being fixed (branch created)",
  fix_pending_review: "Fix submitted, awaiting code review",
  resolved: "Fix verified and merged",
  closed: "No longer relevant or duplicate",
};

export function IssuesModal() {
  const { isOpen, closeIssues } = useIssuesPanel();

  if (!isOpen) return null;

  return <IssuesModalContent closeIssues={closeIssues} />;
}

function IssuesModalContent({ closeIssues }: { closeIssues: () => void }) {
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [appIssueFilter, setAppIssueFilter] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const exportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { issues, count, loading, error, createIssue, updateIssue, deleteIssue, startFix } =
    useIssues({
      project_id: appIssueFilter ? undefined : (projectFilter === "all" ? undefined : projectFilter),
      is_app_issue: appIssueFilter ? true : undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    });

  const sortedIssues = [...issues].sort((a, b) => {
    const aApp = a.is_app_issue ? 1 : 0;
    const bApp = b.is_app_issue ? 1 : 0;
    return bApp - aApp;
  });

  const { projects } = useProjects();
  const titleId = useId();

  // Drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
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
      document.removeEventListener("pointercancel", cleanup);
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", cleanup);
    document.addEventListener("pointercancel", cleanup);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingId) {
          setEditingId(null);
        } else if (deletingId) {
          setDeletingId(null);
        } else if (showCreateForm) {
          setShowCreateForm(false);
        } else {
          e.preventDefault();
          closeIssues();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [closeIssues, editingId, deletingId, showCreateForm]);

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

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteIssue(id);
      setDeletingId(null);
    },
    [deleteIssue],
  );

  const handleCreate = useCallback(
    async (data: IssueCreateRequest) => {
      await createIssue(data);
      setShowCreateForm(false);
    },
    [createIssue],
  );

  const handleExportBugs = useCallback(async () => {
    try {
      const pid = projectFilter === "all" ? undefined : projectFilter;
      const { markdown } = await getClient().exportBugs(pid);
      await navigator.clipboard.writeText(markdown);
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bugs.md";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportDone(true);
      if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
      exportTimeoutRef.current = setTimeout(() => setExportDone(false), 2000);
    } catch (err) {
      if (process.env.NODE_ENV === "development") console.warn("Export bugs failed:", err);
    }
  }, [projectFilter]);

  const panelStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : { right: 16, top: 56 };

  const modal = (
    <TooltipProvider delayDuration={300}>
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
            Bugs
            <FieldHelp slug="issues-overview" tip="Track project bugs with severity levels, fix branches, and PR links. Promote notes to bugs and use start-fix to auto-create git branches." />
            {count > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {count}
              </Badge>
            )}
          </h2>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleExportBugs}
                  className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Export bugs as markdown"
                >
                  {exportDone ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Export bugs — copies to clipboard and downloads .md. AI Workshop issues appear first.</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowHelp(!showHelp)}
                  className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Toggle help guide</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Report a new bug</p>
              </TooltipContent>
            </Tooltip>
            <button
              type="button"
              onClick={closeIssues}
              className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close bugs"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Help panel */}
        {showHelp && (
          <div className="border-b bg-muted/50 px-4 py-2.5 text-[11px] text-muted-foreground">
            <p className="mb-1.5 font-medium text-foreground">How bugs work:</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>
                <strong>Report</strong> bugs with a title, severity, and optional description
              </li>
              <li>
                <strong>Fix this</strong> creates a git branch in the project sandbox and sends
                context to the AI chat
              </li>
              <li>
                <strong>Resolve</strong> marks a bug as fixed — use after verifying the fix
              </li>
              <li>
                <strong>Edit</strong> any field inline by clicking the pencil icon
              </li>
              <li>Notes can be promoted to bugs from the Notes panel</li>
            </ul>
            <p className="mt-1.5 text-[10px] opacity-70">
              Keyboard: Ctrl+Shift+I to toggle this panel. Esc to close.
            </p>
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <IssueCreateForm projects={projects} onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
        )}

        {/* Filters */}
        <div className="flex items-center gap-1.5 border-b px-4 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Filter bugs by project</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Filter bugs by workflow status</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setAppIssueFilter((prev) => {
                    if (!prev) setProjectFilter("all");
                    return !prev;
                  });
                }}
                className={`flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
                  appIssueFilter
                    ? "border-destructive bg-destructive text-destructive-foreground"
                    : "bg-background hover:bg-accent"
                }`}
              >
                <AlertOctagon className="h-3 w-3" />
                AI Workshop
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Show only platform-level AI Workshop issues (not tied to a project)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Content */}
        <ScrollArea className="min-h-0 flex-1 px-4 py-2" style={{ maxHeight: "60vh" }}>
          {loading && sortedIssues.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Loading...</p>
          )}
          {error && <p className="py-4 text-center text-xs text-destructive">{error}</p>}
          {!loading && sortedIssues.length === 0 && (
            <div className="py-8 text-center">
              <Bug className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No bugs found</p>
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                Click + above to report a bug, or promote a note from the Notes panel
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {sortedIssues.map((issue) =>
              editingId === issue.id ? (
                <IssueEditCard
                  key={issue.id}
                  issue={issue}
                  onSave={async (data) => {
                    try {
                      await updateIssue(issue.id, data);
                      setEditingId(null);
                    } catch {
                      // Error captured by useIssues hook
                    }
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : deletingId === issue.id ? (
                <div key={issue.id} className="rounded-lg border border-destructive/50 bg-card p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                    <p className="flex-1 text-xs">
                      Delete <strong>&quot;{issue.title}&quot;</strong>? This cannot be undone.
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 gap-1 text-[10px]"
                      onClick={() => handleDelete(issue.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Confirm delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => setDeletingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onEdit={() => setEditingId(issue.id)}
                  onDelete={() => setDeletingId(issue.id)}
                  onResolve={() => handleResolve(issue.id)}
                  onStartFix={() => handleStartFix(issue)}
                />
              ),
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );

  return createPortal(modal, document.body);
}

/* ------------------------------------------------------------------ */
/*  Create Form                                                        */
/* ------------------------------------------------------------------ */

function IssueCreateForm({
  projects,
  onSubmit,
  onCancel,
}: {
  projects: { id: string; name: string }[];
  onSubmit: (data: IssueCreateRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [scope, setScope] = useState<"app" | "project">("project");
  const isAppIssue = scope === "app";
  const [steps, setSteps] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || (!isAppIssue && !projectId)) return;
    setSubmitting(true);
    try {
      await onSubmit({
        project_id: isAppIssue ? undefined : projectId,
        title: title.trim(),
        description: description.trim() || null,
        severity,
        reproduction_steps: steps.trim() || null,
        is_app_issue: isAppIssue || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="border-b px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">Report a bug</p>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm p-0.5 opacity-60 hover:opacity-100"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scope selector */}
        <div className="flex rounded-md border">
          <button
            type="button"
            onClick={() => { setScope("app"); setProjectId(""); }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-l-md py-1.5 text-xs font-medium transition-colors",
              scope === "app"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            <AlertOctagon className="h-3 w-3" />
            AI Workshop
          </button>
          <button
            type="button"
            onClick={() => setScope("project")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-r-md border-l py-1.5 text-xs font-medium transition-colors",
              scope === "project"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            <Code2 className="h-3 w-3" />
            Project
          </button>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of the bug..."
              className="h-8 w-full rounded-md border bg-background px-2.5 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            <p>A short, descriptive title for the bug (required)</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-1.5">
          {scope === "project" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="" disabled>
                    Project...
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Which project is this bug in? (required)</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as typeof severity)}
                className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px]">
              <p>{SEVERITY_DESCRIPTIONS[severity]}</p>
            </TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? "Less" : "More"}
            {showAdvanced ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>

        {showAdvanced && (
          <div className="space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed description of the problem..."
                  className="min-h-[50px] resize-none text-xs"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                <p>What happened? What did you expect? Include error messages if any.</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Textarea
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder="Steps to reproduce (one per line)..."
                  className="min-h-[40px] resize-none text-xs"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                <p>Step-by-step instructions to trigger the bug. Helps the AI fix it faster.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={!title.trim() || (!isAppIssue && !projectId) || submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Report bug
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Issue Card (read-only)                                             */
/* ------------------------------------------------------------------ */

function IssueCard({
  issue,
  onEdit,
  onDelete,
  onResolve,
  onStartFix,
}: {
  issue: IssueResponse;
  onEdit: () => void;
  onDelete: () => void;
  onResolve: () => void;
  onStartFix: () => void;
}) {
  return (
    <div className="group rounded-lg border bg-card p-3">
      <div className="flex items-start gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Badge
                className={`h-4 shrink-0 cursor-default text-[10px] ${SEVERITY_COLORS[issue.severity] || ""}`}
              >
                {issue.severity}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>{SEVERITY_DESCRIPTIONS[issue.severity]}</p>
          </TooltipContent>
        </Tooltip>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-xs font-medium">
            {issue.is_app_issue && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 rounded bg-destructive px-1 py-0.5 text-[9px] font-bold leading-none text-destructive-foreground">
                    <AlertOctagon className="h-2.5 w-2.5" />
                    APP
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>AI Workshop issue — platform-level, not tied to a specific project</p>
                </TooltipContent>
              </Tooltip>
            )}
            {issue.title}
          </p>
          {issue.project_name && (
            <p className="text-[10px] text-muted-foreground">{issue.project_name}</p>
          )}
          {issue.description && (
            <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
              {issue.description}
            </p>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Badge variant="outline" className="h-4 shrink-0 cursor-default text-[10px]">
                {STATUS_LABELS[issue.status] || issue.status}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{STATUS_DESCRIPTIONS[issue.status]}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-2 flex items-center gap-1">
        {issue.status === "open" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 text-[10px]"
                onClick={onStartFix}
              >
                <Wrench className="h-3 w-3" />
                Fix this
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Create a git branch and send fix context to AI chat</p>
            </TooltipContent>
          </Tooltip>
        )}
        {issue.fix_pr_url && (
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent>
              <p>Open the pull request for this fix in a new tab</p>
            </TooltipContent>
          </Tooltip>
        )}
        {(issue.status === "open" || issue.status === "in_progress") && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 text-[10px]"
                onClick={onResolve}
              >
                <Check className="h-3 w-3" />
                Resolve
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Mark this bug as resolved after verifying the fix</p>
            </TooltipContent>
          </Tooltip>
        )}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
                <Pencil className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Edit bug details</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete this bug permanently</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Issue Edit Card (inline)                                           */
/* ------------------------------------------------------------------ */

function IssueEditCard({
  issue,
  onSave,
  onCancel,
}: {
  issue: IssueResponse;
  onSave: (data: {
    title?: string;
    description?: string | null;
    severity?: "low" | "medium" | "high" | "critical";
    status?: "open" | "in_progress" | "fix_pending_review" | "resolved" | "closed";
    reproduction_steps?: string | null;
    is_app_issue?: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description || "");
  const [severity, setSeverity] = useState(issue.severity);
  const [status, setStatus] = useState(issue.status);
  const [isAppIssue, setIsAppIssue] = useState(issue.is_app_issue ?? false);
  const [steps, setSteps] = useState(issue.reproduction_steps || "");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        severity,
        status,
        reproduction_steps: steps.trim() || null,
        is_app_issue: isAppIssue,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-muted-foreground">Editing bug</p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm p-0.5 opacity-60 hover:opacity-100"
          aria-label="Cancel editing"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Issue title..."
        className="h-7 w-full rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          }
        }}
      />

      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as typeof severity)}
              className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </TooltipTrigger>
          <TooltipContent>
            <p>{SEVERITY_DESCRIPTIONS[severity]}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="fix_pending_review">Pending Review</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </TooltipTrigger>
          <TooltipContent>
            <p>{STATUS_DESCRIPTIONS[status]}</p>
          </TooltipContent>
        </Tooltip>
        <label className="ml-auto flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
          <AlertOctagon className="h-3 w-3" />
          AI Workshop
          <FieldHelp
            slug="issues-app-scope"
            tip="Use for platform-wide issues that are not tied to one project."
          />
          <input
            type="checkbox"
            checked={isAppIssue}
            onChange={(e) => setIsAppIssue(e.target.checked)}
            className="h-3 w-3 rounded border"
          />
        </label>
      </div>

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)..."
        className="min-h-[40px] resize-none text-xs"
      />

      <Textarea
        value={steps}
        onChange={(e) => setSteps(e.target.value)}
        placeholder="Reproduction steps (optional)..."
        className="min-h-[32px] resize-none text-xs"
      />

      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]" onClick={onCancel}>
          <XCircle className="h-3 w-3" />
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-6 gap-1 text-[10px]"
          disabled={!title.trim() || saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save
        </Button>
      </div>
    </div>
  );
}
