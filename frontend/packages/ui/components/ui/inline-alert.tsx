"use client";

import * as React from "react";
import { AlertCircle, Check, AlertTriangle, Info } from "lucide-react";
import { cn } from "../../lib/utils";

type AlertVariant = "error" | "success" | "warning" | "info";

export interface InlineAlertProps {
  message: string;
  variant?: AlertVariant;
  className?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  error: "bg-destructive/10 text-destructive",
  success: "bg-green-500/10 text-green-600 dark:text-green-400",
  warning: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

const variantIcons: Record<AlertVariant, React.ElementType> = {
  error: AlertCircle,
  success: Check,
  warning: AlertTriangle,
  info: Info,
};

/**
 * InlineAlert renders a compact status message with an icon and role="alert" for live-region announcement.
 * Supports four variants: "error" (default), "success", "warning", and "info", each with distinct colors and icons.
 * The component renders nothing when message is an empty string, so it is safe to always mount.
 * Icons are rendered at a fixed 16px size and marked as presentational via the parent's role="alert".
 */
function InlineAlert({ message, variant = "error", className }: InlineAlertProps) {
  if (!message) return null;
  const Icon = variantIcons[variant];
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm rounded-md px-3 py-2",
        variantStyles[variant],
        className
      )}
      role="alert"
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {message}
    </div>
  );
}

export { InlineAlert };
