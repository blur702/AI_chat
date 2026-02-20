"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workstation/ui";
import { Lock } from "lucide-react";
import type { AdminUser } from "@workstation/api/types";

interface UnlockUserDialogProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlock: (userId: string) => Promise<void>;
}

export function UnlockUserDialog({
  user,
  open,
  onOpenChange,
  onUnlock,
}: UnlockUserDialogProps) {
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setUnlocking(false);
  }, [open]);

  const handleUnlock = async () => {
    if (!user) return;
    setUnlocking(true);
    setError(null);
    try {
      await onUnlock(user.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock user");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-500" />
            Unlock Account
          </DialogTitle>
          <DialogDescription className="text-xs">
            This will reset failed login attempts and remove the lockout for{" "}
            <strong>{user?.username}</strong>.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="rounded-md border bg-muted/50 p-3 text-xs space-y-1">
            <p>
              <span className="text-muted-foreground">Failed attempts:</span>{" "}
              {user.failed_login_attempts}
            </p>
            <p>
              <span className="text-muted-foreground">Locked until:</span>{" "}
              {user.locked_until
                ? new Date(user.locked_until).toLocaleString()
                : "N/A"}
            </p>
          </div>
        )}

        {error && <p className="text-[10px] text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={unlocking}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleUnlock} disabled={unlocking}>
            {unlocking ? "Unlocking..." : "Unlock Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
