"use client";

import { useState } from "react";
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workstation/ui";
import {
  Download,
  Upload,
  Play,
  Square,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type {
  StagingStatus,
  CloneRequest,
  PushRequest,
} from "@workstation/api/types";
import { FieldHelp } from "@/components/help/field-help";

interface StagingControlsProps {
  stagingStatus: StagingStatus | null;
  stagingLoading: boolean;
  cloning: boolean;
  pushing: boolean;
  stagingStarting: boolean;
  stagingStopping: boolean;
  onClone: (opts?: CloneRequest) => Promise<unknown>;
  onPush: (opts: PushRequest) => Promise<unknown>;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function StagingControls({
  stagingStatus,
  stagingLoading,
  cloning,
  pushing,
  stagingStarting,
  stagingStopping,
  onClone,
  onPush,
  onStart,
  onStop,
  onRefresh,
}: StagingControlsProps) {
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [pushIncludeDb, setPushIncludeDb] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);

  const isRunning = stagingStatus?.sandbox_running ?? false;

  const handleClone = async () => {
    setCloneDialogOpen(false);
    try {
      await onClone({ include_files: true, include_db: true });
    } catch {
      // Clone errors are surfaced through the staging hook's error state
    }
  };

  const handlePush = async () => {
    setPushDialogOpen(false);
    try {
      await onPush({
        include_files: true,
        include_db: pushIncludeDb,
        confirm: true,
      });
    } catch {
      // Push errors are surfaced through the staging hook's error state
    } finally {
      setPushIncludeDb(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        {/* Status badge */}
        <Badge variant={isRunning ? "default" : "secondary"} className="text-xs">
          {stagingLoading ? "Checking..." : isRunning ? "Running" : "Stopped"}
        </Badge>

        {stagingStatus?.last_clone_at && (
          <span className="text-xs text-muted-foreground">
            Cloned: {new Date(stagingStatus.last_clone_at).toLocaleDateString()}
          </span>
        )}

        <div className="flex-1" />

        {/* Start/Stop */}
        {isRunning ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onStop}
            disabled={stagingStopping}
          >
            {stagingStopping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Square className="h-3.5 w-3.5 mr-1" />
            )}
            Stop
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onStart}
            disabled={stagingStarting}
          >
            {stagingStarting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1" />
            )}
            Start
          </Button>
        )}

        {/* Clone */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCloneDialogOpen(true)}
          disabled={cloning}
        >
          {cloning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Download className="h-3.5 w-3.5 mr-1" />
          )}
          {cloning ? "Cloning..." : "Clone from Prod"}
        </Button>

        {/* Push */}
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setPushDialogOpen(true)}
          disabled={pushing || !isRunning}
        >
          {pushing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Upload className="h-3.5 w-3.5 mr-1" />
          )}
          {pushing ? "Pushing..." : "Push to Prod"}
        </Button>

        {/* Refresh */}
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={stagingLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${stagingLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Clone confirmation dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Production Site</DialogTitle>
            <DialogDescription>
              This will download the database and files from{" "}
              <strong>{stagingStatus?.site_url || "production"}</strong> into
              your local staging sandbox. Any existing staging data will be
              overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClone}>Clone Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push confirmation dialog */}
      <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Push to Production
            </DialogTitle>
            <DialogDescription>
              This will push your staging changes to{" "}
              <strong>{stagingStatus?.site_url || "production"}</strong>. This
              action cannot be easily undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked disabled className="rounded" />
              <span className="inline-flex items-center gap-1.5">
                Push files (themes, modules, config)
                <FieldHelp
                  slug="drupal-staging-push-files"
                  tip="Deploy code and config updates from staging to production."
                />
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                Push database (destructive - overwrites production DB)
                <FieldHelp
                  slug="drupal-staging-push-database"
                  tip="Replaces production content with the staging database."
                />
              </span>
              <input
                type="checkbox"
                checked={pushIncludeDb}
                onChange={(e) => setPushIncludeDb(e.target.checked)}
                className="rounded"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handlePush}>
              Push to Production
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

