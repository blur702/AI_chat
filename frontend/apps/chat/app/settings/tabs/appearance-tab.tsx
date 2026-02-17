"use client";

import { ThemeToggle } from "@workstation/ui";

export function AppearanceTab() {
  return (
    <div className="space-y-6 pt-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Appearance</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Choose how the interface looks, or sync with your system settings.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="text-sm text-muted-foreground">Select your preferred theme</p>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
