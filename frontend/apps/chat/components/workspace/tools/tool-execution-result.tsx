"use client";

import { Badge } from "@workstation/ui";
import { CheckCircle2, XCircle, Clock, Zap } from "lucide-react";
import type { ToolExecuteResponse } from "@workstation/api/types";

interface ToolExecutionResultProps {
  result: ToolExecuteResponse;
}

export function ToolExecutionResult({ result }: ToolExecutionResultProps) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {result.success ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className="text-xs font-medium">{result.tool}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {result.cached && (
            <Badge variant="outline" className="h-4 text-[9px]">
              <Zap className="h-2.5 w-2.5 mr-0.5" />
              cached
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {result.duration_ms}ms
          </span>
        </div>
      </div>

      {result.success && result.result && (
        <pre className="text-[11px] bg-muted rounded-md p-2 overflow-auto max-h-40 whitespace-pre-wrap">
          {JSON.stringify(result.result, null, 2)}
        </pre>
      )}

      {!result.success && result.error && (
        <div className="text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
          {result.error}
        </div>
      )}
    </div>
  );
}
