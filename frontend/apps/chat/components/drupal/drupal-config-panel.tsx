"use client";

import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@workstation/ui";
import {
  Settings2,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { DrupalLocalConfigStatus, DrupalLocalDrushResult } from "@workstation/api/types";

interface Props {
  configStatus: DrupalLocalConfigStatus | null;
  loading: boolean;
  onLoadStatus: () => void;
  onExport: () => Promise<DrupalLocalDrushResult>;
  onImport: () => Promise<DrupalLocalDrushResult>;
}

export function DrupalConfigPanel({ configStatus, loading, onLoadStatus, onExport, onImport }: Props) {
  const [actionResult, setActionResult] = useState<DrupalLocalDrushResult | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const onLoadStatusRef = useRef(onLoadStatus);

  useEffect(() => {
    onLoadStatusRef.current = onLoadStatus;
  }, [onLoadStatus]);

  useEffect(() => {
    onLoadStatusRef.current();
  }, []);

  const handleExport = async () => {
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await onExport();
      setActionResult(result);
      onLoadStatus();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setActionResult({ stdout: "", stderr: message || "Export failed", exit_code: 1 });
      onLoadStatus();
    } finally {
      setActionLoading(false);
    }
  };

  const handleImport = async () => {
    if (!confirm("Import config from sync directory? This may overwrite active config.")) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await onImport();
      setActionResult(result);
      onLoadStatus();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setActionResult({ stdout: "", stderr: message || "Import failed", exit_code: 1 });
      onLoadStatus();
    } finally {
      setActionLoading(false);
    }
  };

  const hasChanges = configStatus && configStatus.items.length > 0;

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Drupal Configuration Management">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Configuration Management
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={actionLoading}
            aria-label="Export configuration"
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={actionLoading}
            aria-label="Import configuration"
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            Import
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onLoadStatus}
            disabled={loading}
            aria-label="Refresh config status"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status summary */}
        <div className={cn(
          "flex items-center gap-2 p-3 rounded-lg border",
          hasChanges ? "border-yellow-500/50 bg-yellow-500/5" : "border-green-500/50 bg-green-500/5"
        )}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasChanges ? (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          <span className="text-sm">
            {loading
              ? "Loading config status..."
              : hasChanges
                ? `${configStatus!.items.length} config difference(s) found`
                : "Configuration is in sync"}
          </span>
        </div>

        {/* Config diff items */}
        {hasChanges && (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm" role="table" aria-label="Configuration differences">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium text-xs uppercase text-muted-foreground" scope="col">Config Name</th>
                  <th className="text-left px-3 py-2 font-medium text-xs uppercase text-muted-foreground" scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {configStatus!.items.map((item, idx) => (
                  <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-mono text-xs">{item.name}</td>
                    <td className="px-3 py-1.5">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        item.state === "Only in sync dir" && "bg-green-500/20 text-green-600",
                        item.state === "Only in DB" && "bg-red-500/20 text-red-600",
                        item.state === "Different" && "bg-yellow-500/20 text-yellow-600",
                      )}>
                        {item.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Action result */}
        {actionResult && (
          <div className={cn(
            "p-3 rounded-lg border font-mono text-xs whitespace-pre-wrap",
            actionResult.exit_code === 0 ? "border-green-500/50 bg-green-500/5" : "border-red-500/50 bg-red-500/5"
          )} role="log" aria-label="Command output">
            {actionResult.stdout || actionResult.stderr}
          </div>
        )}
      </div>
    </div>
  );
}
