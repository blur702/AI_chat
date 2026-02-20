"use client";

import { OffloadPreferences } from "@/components/resources/offload-preferences";
import type { OffloadPreference } from "@workstation/api/types/resource";

interface ResourcesTabProps {
  userId: string | null;
  resourcePreference: OffloadPreference;
  resourcePreferenceLoading: boolean;
  setResourcePreference: (userId: string, pref: OffloadPreference, remember: boolean) => Promise<void>;
}

export function ResourcesTab({
  userId,
  resourcePreference,
  resourcePreferenceLoading,
  setResourcePreference,
}: ResourcesTabProps) {
  return (
    <div className="space-y-6 pt-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Resource Management</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Configure GPU resource offloading, preemption, and VRAM management preferences.
        </p>
      </div>

      <OffloadPreferences
        preference={resourcePreference}
        preferenceLoading={resourcePreferenceLoading}
        onSave={async (pref, remember) => {
          if (!userId) {
            console.error("Cannot save resource preference: userId is not available");
            throw new Error("User session not available. Please log in again.");
          }
          await setResourcePreference(userId, pref, remember);
        }}
        onReset={async () => {
          if (!userId) {
            console.error("Cannot reset resource preference: userId is not available");
            throw new Error("User session not available. Please log in again.");
          }
          await setResourcePreference(userId, "ask_each_time", true);
        }}
      />
    </div>
  );
}
