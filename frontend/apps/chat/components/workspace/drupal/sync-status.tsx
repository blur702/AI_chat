"use client";

import { Button, Badge } from "@workstation/ui";
import {
  Download,
  Upload,
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle,
} from "lucide-react";
import type { SyncStatus as SyncStatusType } from "@workstation/api/types";

function formatSyncTime(dateStr?: string): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface SyncStatusProps {
  syncStatus: SyncStatusType | null;
  pulling: boolean;
  pushing: boolean;
  onPull: () => Promise<void>;
  onPush: () => Promise<void>;
  error: string | null;
}

export function SyncStatus({
  syncStatus,
  pulling,
  pushing,
  onPull,
  onPush,
  error,
}: SyncStatusProps) {
  const lastSync = syncStatus?.last_sync_at;
  const neverSynced = !lastSync;

  return (
    <div className="space-y-4 p-4">
      {/* Sync info */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Sync Status</span>
          {neverSynced ? (
            <Badge variant="outline" className="text-[10px]">
              <AlertTriangle className="mr-1 h-3 w-3 text-yellow-500" />
              Never synced
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              <CheckCircle className="mr-1 h-3 w-3 text-green-500" />
              Synced
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Last sync: {formatSyncTime(lastSync)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          className="w-full justify-start gap-2"
          variant="outline"
          onClick={onPull}
          disabled={pulling || pushing}
        >
          {pulling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <div className="text-left">
            <div className="text-sm">Pull from Remote</div>
            <div className="text-[10px] text-muted-foreground">
              Download database and files into sandbox
            </div>
          </div>
        </Button>

        <Button
          className="w-full justify-start gap-2"
          variant="outline"
          onClick={onPush}
          disabled={pulling || pushing}
        >
          {pushing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <div className="text-left">
            <div className="text-sm">Push Config to Remote</div>
            <div className="text-[10px] text-muted-foreground">
              Export local config and upload to remote site
            </div>
          </div>
        </Button>
      </div>

      {/* Warning for first sync */}
      {neverSynced && (
        <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-600 dark:text-yellow-400">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">No sync performed yet</div>
              <div className="mt-1 text-muted-foreground">
                Pull from the remote site to import the database and files into
                your sandbox environment.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}
