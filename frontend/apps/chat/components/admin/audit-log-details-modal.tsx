"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  cn,
} from "@workstation/ui";
import type { AuditLogEntry } from "@workstation/api/types";

interface AuditLogDetailsModalProps {
  log: AuditLogEntry | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-green-500/10 text-green-600 border-green-500/20",
  failure: "bg-red-500/10 text-red-600 border-red-500/20",
  error: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-xs font-medium text-muted-foreground w-24 shrink-0">
        {label}
      </span>
      <span
        className={cn(
          "text-xs break-all",
          mono && "font-mono",
          !value && "text-muted-foreground italic"
        )}
      >
        {value ?? "N/A"}
      </span>
    </div>
  );
}

export function AuditLogDetailsModal({
  log,
  open,
  onClose,
}: AuditLogDetailsModalProps) {
  if (!log) return null;

  const statusStyle =
    STATUS_STYLES[log.status] ?? "bg-muted text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            Audit Log Details
            <Badge
              variant="outline"
              className={cn("text-[10px] capitalize", statusStyle)}
            >
              {log.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="divide-y">
          <div className="space-y-0.5 pb-3">
            <DetailRow label="Log ID" value={log.id} mono />
            <DetailRow
              label="Timestamp"
              value={new Date(log.created_at).toLocaleString()}
            />
          </div>

          <div className="space-y-0.5 py-3">
            <DetailRow label="User" value={log.username} />
            <DetailRow label="User ID" value={log.user_id} mono />
            <DetailRow label="Action" value={log.action} mono />
            <DetailRow label="Resource" value={log.resource} />
          </div>

          <div className="space-y-0.5 py-3">
            <DetailRow label="IP Address" value={log.ip_address} mono />
            <DetailRow label="User Agent" value={log.user_agent} />
          </div>

          {log.details && Object.keys(log.details).length > 0 && (
            <div className="pt-3">
              <span className="text-xs font-medium text-muted-foreground">
                Details
              </span>
              <pre className="mt-1.5 rounded-md bg-muted p-3 text-[11px] overflow-x-auto max-h-[250px]">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
