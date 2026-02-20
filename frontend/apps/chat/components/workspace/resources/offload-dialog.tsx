"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workstation/ui";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import type { OffloadDecision } from "@workstation/api/types";
import { FieldHelp } from "@/components/help/field-help";

interface OffloadDialogProps {
  open: boolean;
  onClose: () => void;
  resourceId: string | null;
  onConfirm: (decision: OffloadDecision, remember: boolean) => Promise<void>;
  loading: boolean;
}

export function OffloadDialog({
  open,
  onClose,
  resourceId,
  onConfirm,
  loading,
}: OffloadDialogProps) {
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (open && resourceId) {
      setRemember(false);
    }
  }, [resourceId, open]);

  if (!resourceId) return null;

  const handleOffload = async () => {
    try {
      await onConfirm("offload", remember);
    } catch (err) {
      console.error("Offload failed:", err);
    } finally {
      onClose();
    }
  };

  const handleCancel = async () => {
    try {
      await onConfirm("cancel", remember);
    } catch (err) {
      console.error("Cancel offload failed:", err);
    } finally {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowDownToLine className="h-4 w-4" />
            Offload to CPU
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Move a model from GPU VRAM to system RAM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Offload <span className="font-mono font-medium text-foreground">{resourceId}</span> from
            GPU VRAM to system RAM? The model will remain available but inference will be slower.
          </p>

          <div className="flex items-center gap-2 text-xs">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              Remember my choice for future offload decisions
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-muted-foreground"
              />
            </label>
            <FieldHelp
              slug="resource-remember-preference"
              tip="Save this decision so future offload prompts use the same behavior."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleOffload} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />
            )}
            Offload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
