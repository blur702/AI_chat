"use client";

import { useState } from "react";
import {
  Button,
  Input,
  ScrollArea,
  Badge,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workstation/ui";
import {
  X,
  Check,
  Trash2,
  Play,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { useAutomationActions } from "@workstation/api/hooks";
import type { AutomationAction } from "@workstation/api/types";

interface AutomationActionsPanelProps {
  projectId: string;
  onClose: () => void;
}

const ACTION_TYPE_COLORS: Record<string, string> = {
  file_create: "bg-green-500/10 text-green-600 border-green-500/20",
  file_modify: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  file_delete: "bg-red-500/10 text-red-600 border-red-500/20",
  run_command: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  install_package: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

/** Fields editable per action type. */
const EDITABLE_FIELDS: Record<string, { key: string; label: string }[]> = {
  file_create: [
    { key: "path", label: "File Path" },
    { key: "content", label: "Content" },
  ],
  file_modify: [
    { key: "path", label: "File Path" },
    { key: "content", label: "Content" },
  ],
  file_delete: [{ key: "path", label: "File Path" }],
  run_command: [{ key: "command", label: "Command" }],
  install_package: [
    { key: "package", label: "Package" },
    { key: "manager", label: "Manager (pip/npm/yarn/pnpm)" },
  ],
};

function getActionDescription(action: AutomationAction): string {
  const data = action.action_data || {};
  switch (action.action_type) {
    case "file_create":
      return `Create file: ${data.path || "unknown"}`;
    case "file_modify":
      return `Modify file: ${data.path || "unknown"}`;
    case "file_delete":
      return `Delete file: ${data.path || "unknown"}`;
    case "run_command":
      return `Run: ${data.command || "unknown"}`;
    case "install_package":
      return `Install ${data.package || "unknown"} (${data.manager || "pip"})`;
    default:
      return action.action_type;
  }
}

function ActionCard({
  action,
  onApprove,
  onReject,
  onExecute,
}: {
  action: AutomationAction;
  onApprove: (action: AutomationAction) => void;
  onReject: (id: string) => void;
  onExecute: (id: string) => void;
}) {
  const isPending = !action.user_approved && !action.executed_at;
  const isApproved = action.user_approved && !action.executed_at;
  const isExecuted = !!action.executed_at;
  const executionResult = action.action_data?._execution_result;

  return (
    <div className="rounded-md border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] shrink-0",
            ACTION_TYPE_COLORS[action.action_type] || "bg-muted"
          )}
        >
          {action.action_type}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {action.created_at
            ? new Date(action.created_at).toLocaleTimeString()
            : ""}
        </span>
      </div>

      <p className="text-xs">{getActionDescription(action)}</p>

      {isExecuted && executionResult && (
        <div
          className={cn(
            "rounded px-2 py-1 text-[10px]",
            executionResult.success
              ? "bg-green-500/10 text-green-600"
              : "bg-red-500/10 text-red-600"
          )}
        >
          {executionResult.success ? "Completed" : "Failed"}
          {executionResult.error && `: ${executionResult.error}`}
        </div>
      )}

      <div className="flex gap-1.5">
        {isPending && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={() => onApprove(action)}
            >
              <Check className="h-3 w-3" /> Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1 text-destructive"
              onClick={() => onReject(action.id)}
            >
              <Trash2 className="h-3 w-3" /> Reject
            </Button>
          </>
        )}
        {isApproved && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => onExecute(action.id)}
          >
            <Play className="h-3 w-3" /> Execute
          </Button>
        )}
        {isExecuted && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Executed
          </span>
        )}
      </div>
    </div>
  );
}

export function AutomationActionsPanel({
  projectId,
  onClose,
}: AutomationActionsPanelProps) {
  const { actions, loading, error, approve, execute, reject } =
    useAutomationActions(projectId);
  const [showExecuted, setShowExecuted] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Approval dialog state
  const [approveAction, setApproveAction] = useState<AutomationAction | null>(
    null
  );
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [jsonError, setJsonError] = useState<string | null>(null);

  const pendingActions = actions.filter(
    (a) => !a.user_approved && !a.executed_at
  );
  const approvedActions = actions.filter(
    (a) => a.user_approved && !a.executed_at
  );
  const executedActions = actions.filter((a) => !!a.executed_at);

  const handleApproveClick = (action: AutomationAction) => {
    setApproveAction(action);
    setEditedData({ ...(action.action_data || {}) });
    setJsonError(null);
  };

  const handleEditField = (key: string, value: string) => {
    setEditedData((prev) => ({ ...prev, [key]: value }));
  };

  const confirmApprove = async () => {
    if (!approveAction || jsonError) return;
    try {
      await approve(approveAction.id, editedData);
    } catch {
      // error state handled by hook
    }
    setApproveAction(null);
    setEditedData({});
  };

  const handleReject = (id: string) => {
    setConfirmId(id);
  };

  const confirmReject = async () => {
    if (confirmId) {
      try {
        await reject(confirmId);
      } catch {
        // error state handled by hook
      }
      setConfirmId(null);
    }
  };

  const handleExecute = async (id: string) => {
    try {
      await execute(id);
    } catch {
      // error state handled by hook
    }
  };

  const approveFields =
    approveAction && EDITABLE_FIELDS[approveAction.action_type];

  return (
    <div className="flex h-full flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase">Actions</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {loading && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Loading actions...
            </p>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && actions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No automation actions yet. The AI will propose actions during chat.
            </p>
          )}

          {/* Pending Actions */}
          {pendingActions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">
                Pending Approval ({pendingActions.length})
              </h3>
              {pendingActions.map((a) => (
                <ActionCard
                  key={a.id}
                  action={a}
                  onApprove={handleApproveClick}
                  onReject={handleReject}
                  onExecute={handleExecute}
                />
              ))}
            </div>
          )}

          {/* Approved (Ready to Execute) */}
          {approvedActions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">
                Ready to Execute ({approvedActions.length})
              </h3>
              {approvedActions.map((a) => (
                <ActionCard
                  key={a.id}
                  action={a}
                  onApprove={handleApproveClick}
                  onReject={handleReject}
                  onExecute={handleExecute}
                />
              ))}
            </div>
          )}

          {/* Executed (collapsible) */}
          {executedActions.length > 0 && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground hover:text-foreground"
                onClick={() => setShowExecuted(!showExecuted)}
              >
                {showExecuted ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Executed ({executedActions.length})
              </button>
              {showExecuted &&
                executedActions.map((a) => (
                  <ActionCard
                    key={a.id}
                    action={a}
                    onApprove={handleApproveClick}
                    onReject={handleReject}
                    onExecute={handleExecute}
                  />
                ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Approve + Edit dialog */}
      <Dialog
        open={approveAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setApproveAction(null);
            setEditedData({});
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Review &amp; Approve Action
            </DialogTitle>
          </DialogHeader>

          {approveAction && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    ACTION_TYPE_COLORS[approveAction.action_type] || "bg-muted"
                  )}
                >
                  {approveAction.action_type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {getActionDescription(approveAction)}
                </span>
              </div>

              {approveFields ? (
                <div className="space-y-2">
                  {approveFields.map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        {label}
                      </label>
                      {key === "content" ? (
                        <textarea
                          value={editedData[key] ?? ""}
                          onChange={(e) => handleEditField(key, e.target.value)}
                          rows={6}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                        />
                      ) : (
                        <Input
                          value={editedData[key] ?? ""}
                          onChange={(e) => handleEditField(key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Action Data (JSON)
                  </label>
                  <textarea
                    value={JSON.stringify(editedData, null, 2)}
                    onChange={(e) => {
                      try {
                        setEditedData(JSON.parse(e.target.value));
                        setJsonError(null);
                      } catch {
                        setJsonError("Invalid JSON");
                      }
                    }}
                    rows={6}
                    className={cn(
                      "flex w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono",
                      jsonError ? "border-destructive" : "border-input"
                    )}
                  />
                  {jsonError && (
                    <p className="text-xs text-destructive mt-1">{jsonError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveAction(null);
                setEditedData({});
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmApprove} disabled={!!jsonError}>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject confirmation dialog */}
      <Dialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Action?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this proposed action. This cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmReject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
