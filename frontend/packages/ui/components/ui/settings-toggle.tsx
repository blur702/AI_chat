"use client";

import * as React from "react";
import { Switch } from "./switch";
import { cn } from "../../lib/utils";

export interface SettingsToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * SettingsToggle composes a labeled row with an optional description and a Switch control.
 * The label string is passed as aria-label to the underlying Switch for screen reader compatibility.
 * Use the description prop to provide supplementary hint text displayed below the label.
 * The optional children slot renders inline content (e.g. a badge or icon) next to the label text.
 */
function SettingsToggle({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
  children,
}: SettingsToggleProps) {
  return (
    <div className={cn("flex items-center justify-between rounded-lg border p-4", className)}>
      <div>
        <p className="text-sm font-medium flex items-center gap-1.5">
          {label}
          {children}
        </p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}

export { SettingsToggle };
