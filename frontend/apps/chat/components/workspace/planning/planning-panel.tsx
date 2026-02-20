"use client";

import { useState, useCallback } from "react";
import {
  Button,
  Badge,
  ScrollArea,
  Progress,
} from "@workstation/ui";
import {
  X,
  Plus,
  Play,
  SkipForward,
  Archive,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Shield,
  Send,
  Trash2,
} from "lucide-react";
import { usePlanning } from "@workstation/api/hooks";
import type {
  PlanningSession,
  PlanningSessionDetail,
  PlanPhase,
  PlanTask,
} from "@workstation/api/types/planning";

interface PlanningPanelProps {
  projectId: string;
  chatId?: string;
  onClose?: () => void;
  onExportToUIBuilder?: (uiTree: Record<string, unknown>[]) => void;
}

const STATUS_ICONS: Record<string, typeof Circle> = {
  pending: Circle,
  draft: Circle,
  active: Clock,
  ready: Clock,
  in_progress: Loader2,
  verifying: Shield,
  completed: CheckCircle2,
  failed: AlertCircle,
  archived: Archive,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-muted-foreground",
  draft: "text-muted-foreground",
  active: "text-blue-500",
  ready: "text-blue-500",
  in_progress: "text-yellow-500",
  verifying: "text-purple-500",
  completed: "text-green-500",
  failed: "text-red-500",
  archived: "text-muted-foreground",
};

function StatusIcon({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] || Circle;
  const color = STATUS_COLORS[status] || "text-muted-foreground";
  return <Icon className={`h-4 w-4 ${color} ${status === "in_progress" ? "animate-spin" : ""}`} />;
}

export function PlanningPanel({
  projectId,
  chatId,
  onClose,
  onExportToUIBuilder,
}: PlanningPanelProps) {
  const planning = usePlanning(projectId);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const togglePhase = useCallback((phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    await planning.createSession({
      project_id: projectId,
      chat_id: chatId,
      title: newTitle.trim(),
      target_type: "sandbox",
    });
    setNewTitle("");
    setCreating(false);
  }, [newTitle, projectId, chatId, planning.createSession]);

  const handleExportUI = useCallback(async () => {
    if (!planning.selectedSession) return;
    const tree = await planning.exportToUIBuilder(planning.selectedSession.id);
    if (tree && onExportToUIBuilder) {
      onExportToUIBuilder(tree);
    }
  }, [planning.selectedSession, planning.exportToUIBuilder, onExportToUIBuilder]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Plans</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCreating(!creating)}
            title="New plan"
          >
            <Plus className="h-4 w-4" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* New session form */}
      {creating && (
        <div className="border-b p-3 space-y-2">
          <input
            className="w-full rounded border bg-background px-2 py-1 text-sm"
            placeholder="Plan title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!newTitle.trim()}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Session list (left sidebar) */}
        <div className="w-48 shrink-0 border-r overflow-y-auto">
          {planning.loading && !planning.sessions.length ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
          ) : planning.sessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No plans yet. Use Plan mode in chat or click + to create one.
            </div>
          ) : (
            planning.sessions.map((s) => (
              <button
                key={s.id}
                className={`w-full text-left px-3 py-2 text-xs border-b hover:bg-accent transition-colors ${
                  planning.selectedSession?.id === s.id ? "bg-accent" : ""
                }`}
                onClick={() => planning.loadSession(s.id)}
              >
                <div className="flex items-center gap-1.5">
                  <StatusIcon status={s.status} />
                  <span className="truncate font-medium">{s.title}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {s.target_type}
                  </Badge>
                  <span>
                    {s.completed_phase_count}/{s.phase_count}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Session detail (right area) */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {planning.selectedSession ? (
            <SessionDetail
              session={planning.selectedSession}
              progress={planning.progress}
              expandedPhases={expandedPhases}
              togglePhase={togglePhase}
              onStart={() => planning.selectedSession && planning.startSession(planning.selectedSession.id)}
              onNextPhase={() => planning.selectedSession && planning.nextPhase(planning.selectedSession.id)}
              onArchive={() => planning.selectedSession && planning.archiveSession(planning.selectedSession.id)}
              onApprovePhase={planning.approvePhase}
              onVerifyPhase={planning.verifyPhase}
              onExecuteTask={planning.executeTask}
              onDeletePhase={planning.deletePhase}
              onDeleteTask={planning.deleteTask}
              onExportUI={handleExportUI}
              showExportUI={
                planning.selectedSession.target_type === "ui_builder" ||
                planning.selectedSession.target_type === "both"
              }
            />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              Select a plan to view details
            </div>
          )}
        </div>
      </div>

      {/* Error display */}
      {planning.error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {planning.error}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Session Detail subcomponent
// -------------------------------------------------------------------------

interface SessionDetailProps {
  session: PlanningSessionDetail;
  progress: import("@workstation/api/types/planning").PlanProgress | null;
  expandedPhases: Set<string>;
  togglePhase: (id: string) => void;
  onStart: () => void;
  onNextPhase: () => void;
  onArchive: () => void;
  onApprovePhase: (id: string) => void;
  onVerifyPhase: (id: string) => void;
  onExecuteTask: (id: string) => void;
  onDeletePhase: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onExportUI: () => void;
  showExportUI: boolean;
}

function SessionDetail({
  session,
  progress,
  expandedPhases,
  togglePhase,
  onStart,
  onNextPhase,
  onArchive,
  onApprovePhase,
  onVerifyPhase,
  onExecuteTask,
  onDeletePhase,
  onDeleteTask,
  onExportUI,
  showExportUI,
}: SessionDetailProps) {
  return (
    <>
      {/* Header */}
      <div className="border-b px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{session.title}</h4>
            <Badge variant="outline" className="text-[10px]">
              {session.status}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {session.status === "draft" && session.phases.length > 0 && (
              <Button size="sm" variant="default" onClick={onStart} className="h-7 text-xs">
                <Play className="h-3 w-3 mr-1" /> Start
              </Button>
            )}
            {session.status === "in_progress" && (
              <Button size="sm" variant="default" onClick={onNextPhase} className="h-7 text-xs">
                <SkipForward className="h-3 w-3 mr-1" /> Next Phase
              </Button>
            )}
            {showExportUI && (
              <Button size="sm" variant="outline" onClick={onExportUI} className="h-7 text-xs">
                <Send className="h-3 w-3 mr-1" /> UI Builder
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onArchive} className="h-7 text-xs text-muted-foreground">
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {session.description && (
          <p className="text-xs text-muted-foreground">{session.description}</p>
        )}

        {/* Progress bar */}
        {progress && (
          <div className="space-y-1">
            <Progress value={progress.progress_percentage} className="h-1.5" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>
                Phase {progress.completed_phases}/{progress.total_phases}
              </span>
              <span>
                Tasks {progress.completed_tasks}/{progress.total_tasks}
              </span>
              <span>{progress.progress_percentage}%</span>
            </div>
          </div>
        )}

        {/* Success criteria */}
        {session.success_criteria && session.success_criteria.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase">
              Success Criteria
            </span>
            <ul className="text-xs space-y-0.5">
              {session.success_criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-1">
                  <CheckCircle2 className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Phases */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {session.phases.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No phases yet. Switch to Plan mode in chat to generate a structured plan.
            </div>
          ) : (
            session.phases.map((phase) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                isExpanded={expandedPhases.has(phase.id)}
                isCurrent={session.current_phase_id === phase.id}
                onToggle={() => togglePhase(phase.id)}
                onApprove={() => onApprovePhase(phase.id)}
                onVerify={() => onVerifyPhase(phase.id)}
                onExecuteTask={onExecuteTask}
                onDelete={() => onDeletePhase(phase.id)}
                onDeleteTask={onDeleteTask}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </>
  );
}

// -------------------------------------------------------------------------
// Phase Card subcomponent
// -------------------------------------------------------------------------

interface PhaseCardProps {
  phase: PlanPhase;
  isExpanded: boolean;
  isCurrent: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onVerify: () => void;
  onExecuteTask: (taskId: string) => void;
  onDelete: () => void;
  onDeleteTask: (taskId: string) => void;
}

function PhaseCard({
  phase,
  isExpanded,
  isCurrent,
  onToggle,
  onApprove,
  onVerify,
  onExecuteTask,
  onDelete,
  onDeleteTask,
}: PhaseCardProps) {
  const completedTasks = phase.tasks.filter((t) => t.status === "completed").length;

  return (
    <div
      className={`rounded border text-xs ${
        isCurrent ? "border-blue-500/50 bg-blue-500/5" : "border-border"
      }`}
    >
      {/* Phase header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors"
        onClick={onToggle}
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <StatusIcon status={phase.status} />
        <span className="truncate font-medium flex-1 text-left">{phase.title}</span>
        {isCurrent && (
          <Badge variant="default" className="text-[9px] px-1 py-0">
            Current
          </Badge>
        )}
        <span className="text-muted-foreground">
          {completedTasks}/{phase.tasks.length}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-2">
          {phase.description && (
            <p className="text-muted-foreground">{phase.description}</p>
          )}

          {/* Inputs/Outputs */}
          <div className="flex gap-4">
            {phase.inputs && phase.inputs.length > 0 && (
              <div>
                <span className="text-[10px] font-medium text-muted-foreground">Inputs:</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {phase.inputs.map((inp, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] px-1 py-0">
                      {inp}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {phase.outputs && phase.outputs.length > 0 && (
              <div>
                <span className="text-[10px] font-medium text-muted-foreground">Outputs:</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {phase.outputs.map((out, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">
                      {out}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tasks */}
          {phase.tasks.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Tasks:</span>
              {phase.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 rounded px-2 py-1 bg-background"
                >
                  <StatusIcon status={task.status} />
                  <span className="flex-1 truncate">{task.title}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {task.task_type}
                  </Badge>
                  {(task.status === "ready" || task.status === "pending") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => onExecuteTask(task.id)}
                      title="Execute task"
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-muted-foreground"
                    onClick={() => onDeleteTask(task.id)}
                    title="Delete task"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Verification checks */}
          {phase.verification_checks && phase.verification_checks.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                Verification Checks:
              </span>
              {phase.verification_checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {check.type}
                  </Badge>
                  <span className="truncate">{check.criteria}</span>
                </div>
              ))}
            </div>
          )}

          {/* Verification result */}
          {phase.verification_result && (
            <div
              className={`rounded p-2 text-[10px] ${
                (phase.verification_result as { passed?: boolean }).passed
                  ? "bg-green-500/10 text-green-700"
                  : "bg-red-500/10 text-red-700"
              }`}
            >
              {(phase.verification_result as { summary?: string }).summary || "Verification complete"}
            </div>
          )}

          {/* Phase actions */}
          <div className="flex items-center gap-1 pt-1 border-t">
            {!phase.user_approved && (
              <Button size="sm" variant="outline" onClick={onApprove} className="h-6 text-[10px]">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
              </Button>
            )}
            {phase.user_approved && phase.status !== "completed" && (
              <Button size="sm" variant="outline" onClick={onVerify} className="h-6 text-[10px]">
                <Shield className="h-3 w-3 mr-1" /> Verify
              </Button>
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="h-6 text-[10px] text-muted-foreground"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
