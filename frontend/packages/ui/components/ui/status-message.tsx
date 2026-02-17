"use client";

import * as React from "react";
import { InlineAlert } from "./inline-alert";

export interface StatusMessageProps {
  message: string;
  type: "success" | "error";
  className?: string;
}

/**
 * StatusMessage is a thin wrapper around InlineAlert for binary success/error feedback.
 * The type prop accepts "success" or "error" and is mapped to the corresponding InlineAlert variant.
 * Renders nothing when message is empty, making it safe to always mount in forms and async workflows.
 * Inherits role="alert" from InlineAlert so state changes are announced by screen readers.
 */
function StatusMessage({ message, type, className }: StatusMessageProps) {
  if (!message) return null;
  return (
    <InlineAlert
      message={message}
      variant={type === "success" ? "success" : "error"}
      className={className}
    />
  );
}

export { StatusMessage };
