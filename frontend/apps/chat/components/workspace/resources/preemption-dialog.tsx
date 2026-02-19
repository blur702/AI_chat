"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Badge,
} from "@workstation/ui";
import { AlertTriangle, Loader2 } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

interface PreemptionDialogProps {
  open: boolean;
  onClose: () => void;
  resourceId: string | null;
  preemptableResources: string[];
  freeVramMb: number;
  requiredVramMb: number;
  onConfirm: (remember: boolean) => Promise<void>;
  loading: boolean;
}

export function PreemptionDialog({
  open,
  onClose,
  resourceId,
  preemptableResources,
  freeVramMb,
  requiredVramMb,
  onConfirm,
  loading,
}: PreemptionDialogProps) {
  const [remember, setRemember] = useState(false);

  if (!resourceId) return null;

  const deficit = Math.max(0, requiredVramMb - freeVramMb);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Preemption Required
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Free GPU memory by removing lower-priority resources.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Insufficient VRAM to reload{" "}
            <span className="font-mono font-medium text-foreground">{resourceId}</span>.
            Need <span className="font-medium text-foreground">{requiredVramMb} MB</span>, only{" "}
            <span className="font-medium text-foreground">{freeVramMb} MB</span> free
            (deficit: {deficit} MB).
          </p>

          {preemptableResources.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1.5">
                The following resources can be preempted:
              </p>
              <div className="flex flex-wrap gap-1">
                {preemptableResources.map((id) => (
                  <Badge
                    key={id}
                    variant="outline"
                    className="text-[10px] font-mono"
                  >
                    {id}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <span className="inline-flex items-center gap-1.5">
              Remember my choice for future preemption decisions
              <FieldHelp
                slug="resource-remember-preference"
                tip="Save this decision for future preemption confirmation prompts."
              />
            </span>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded border-muted-foreground"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onConfirm(remember)}
            disabled={loading || preemptableResources.length === 0}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            )}
            Preempt & Reload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
