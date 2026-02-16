"use client";

import { Badge } from "@workstation/ui";
import type { CompactionStatusResponse } from "@workstation/api";
import { Check, Loader2, X } from "lucide-react";

interface CompactionProgressProps {
  compacting: boolean;
  compactionStatus: CompactionStatusResponse | null;
}

const STEPS = [
  { key: "pending", label: "Enqueued" },
  { key: "running", label: "Compacting" },
  { key: "completed", label: "Done" },
] as const;

function getActiveStep(status: string | null): number {
  if (!status) return 0;
  if (status === "pending") return 0;
  if (status === "running") return 1;
  if (status === "completed" || status === "failed") return 2;
  return 0;
}

export function CompactionProgress({ compacting, compactionStatus }: CompactionProgressProps) {
  if (!compacting && !compactionStatus) return null;

  const status = compactionStatus?.status ?? (compacting ? "pending" : null);
  if (!status) return null;

  const activeStep = getActiveStep(status);
  const isFailed = status === "failed";
  const isCompleted = status === "completed";

  const originalCount = compactionStatus?.original_message_count ?? 0;
  const compactedCount = compactionStatus?.compacted_message_count ?? 0;

  return (
    <div className="rounded-md border p-3 space-y-2" role="status" aria-label="Compaction progress">
      {/* Step indicators */}
      <div className="flex items-center gap-1" aria-label={`Step ${activeStep + 1} of ${STEPS.length}: ${STEPS[Math.min(activeStep, STEPS.length - 1)].label}`}>
        {STEPS.map((step, idx) => {
          const isActive = idx === activeStep && !isCompleted && !isFailed;
          const isDone = (idx < activeStep && !isFailed) || (isCompleted && idx <= activeStep);
          const isFailedStep = isFailed && idx === activeStep;

          return (
            <div key={step.key} className="flex items-center gap-1">
              {idx > 0 && (
                <div
                  className={`h-px w-4 ${
                    isDone ? "bg-green-500" : isFailedStep ? "bg-red-500" : "bg-muted-foreground/30"
                  }`}
                />
              )}
              <div className="flex items-center gap-1">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                    isDone
                      ? "bg-green-500/20 text-green-600"
                      : isFailedStep
                        ? "bg-red-500/20 text-red-600"
                        : isActive
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone && !isFailedStep ? (
                    <Check className="h-3 w-3" />
                  ) : isFailedStep ? (
                    <X className="h-3 w-3" />
                  ) : isActive ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-[10px] ${
                    isActive ? "text-foreground font-medium" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Message delta on completion */}
      {isCompleted && originalCount > 0 && (
        <div className="flex items-center gap-2 text-[10px]">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600">
            Compacted {originalCount.toLocaleString()} msgs
          </Badge>
          <span className="text-muted-foreground">
            {originalCount.toLocaleString()} → {compactedCount.toLocaleString()} msgs
          </span>
        </div>
      )}

      {/* Failed message */}
      {isFailed && (
        <p className="text-[10px] text-red-500">
          Compaction failed. Try again later.
        </p>
      )}
    </div>
  );
}
