"use client";

import { ThemeToggle } from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";

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
          <p className="text-sm font-medium flex items-center gap-1">
            Theme
            <FieldHelp slug="settings-theme" tip="Switch between Light, Dark, or System theme. System automatically follows your OS preference and is the most accessible default." />
          </p>
          <p className="text-sm text-muted-foreground">Select your preferred theme</p>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
