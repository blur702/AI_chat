"use client";

import React from "react";
import type { ToolCallInfo } from "@workstation/api/hooks";
import type { StreamToolApprovalRequiredEvent } from "@workstation/api/types";
import { Button } from "@workstation/ui";

interface ToolCallDisplayProps {
  toolCalls: ToolCallInfo[];
  pendingApproval: StreamToolApprovalRequiredEvent | null;
  onApprove: (callId: string) => void;
  onDeny: (callId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  calling: "text-blue-500",
  executing: "text-yellow-500",
  success: "text-green-500",
  error: "text-red-500",
  pending_approval: "text-orange-500",
  denied: "text-gray-500",
  timed_out: "text-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  calling: "Calling...",
  executing: "Executing...",
  success: "Done",
  error: "Failed",
  pending_approval: "Awaiting Approval",
  denied: "Denied",
  timed_out: "Timed Out",
};

const TOOL_ICONS: Record<string, string> = {
  web_search: "🔍",
  screenshot: "📸",
  desktop_click: "🖱️",
  desktop_type: "⌨️",
  desktop_key: "⌨️",
  screen_info: "🖥️",
  code_read: "📖",
  code_write: "✏️",
  code_patch: "🔧",
  run_command: "▶️",
};

export function ToolCallDisplay({ toolCalls, pendingApproval, onApprove, onDeny }: ToolCallDisplayProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="space-y-2 my-2">
      {toolCalls.map((tc) => (
        <div
          key={tc.call_id}
          className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
        >
          <span className="text-lg leading-none mt-0.5">
            {TOOL_ICONS[tc.tool_name] ?? "🔧"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{tc.tool_name}</span>
              <span className={`text-xs ${STATUS_COLORS[tc.status] ?? "text-muted-foreground"}`}>
                {STATUS_LABELS[tc.status] ?? tc.status}
              </span>
              {tc.duration_ms != null && tc.duration_ms > 0 && (
                <span className="text-xs text-muted-foreground">
                  {tc.duration_ms}ms
                </span>
              )}
            </div>
            {tc.status !== "success" && tc.status !== "error" && Object.keys(tc.arguments).length > 0 && (
              <div className="mt-1 text-xs text-muted-foreground font-mono truncate max-w-[400px]">
                {JSON.stringify(tc.arguments).slice(0, 120)}
                {JSON.stringify(tc.arguments).length > 120 && "..."}
              </div>
            )}
            {tc.result_preview && (
              <div className="mt-1 text-xs text-muted-foreground truncate max-w-[400px]">
                {tc.result_preview.slice(0, 150)}
                {tc.result_preview.length > 150 && "..."}
              </div>
            )}
          </div>

          {/* Approval buttons */}
          {tc.status === "pending_approval" && pendingApproval?.call_id === tc.call_id && (
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="default" onClick={() => onApprove(tc.call_id)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDeny(tc.call_id)}>
                Deny
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
