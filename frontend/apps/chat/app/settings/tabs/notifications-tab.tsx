"use client";

import { useState, useEffect } from "react";
import { LoadingButton, SettingsToggle, StatusMessage } from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";
import type { UserPreferences } from "@workstation/api/types";

interface NotificationsTabProps {
  preferences: UserPreferences | null;
  updatePreferences: (data: Partial<UserPreferences>) => Promise<{ success: boolean; error?: string }>;
  preferencesSaving: boolean;
}

export function NotificationsTab({ preferences, updatePreferences, preferencesSaving }: NotificationsTabProps) {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (preferences) {
      setEmailNotifications(preferences.email_notifications ?? true);
      setInAppNotifications(preferences.in_app_notifications ?? true);
    }
  }, [preferences]);

  const handleSave = async () => {
    setMsg(null);
    const result = await updatePreferences({
      email_notifications: emailNotifications,
      in_app_notifications: inAppNotifications,
    });
    if (result.success) {
      setMsg({ text: "Notification preferences saved", type: "success" });
    } else {
      setMsg({ text: result.error ?? "Failed to save preferences", type: "error" });
    }
  };

  return (
    <div className="space-y-6 pt-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Notifications</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Configure how you receive notifications.
        </p>
      </div>

      <div className="space-y-4">
        <SettingsToggle
          label="Email Notifications"
          description="Receive notifications via email"
          checked={emailNotifications}
          onCheckedChange={setEmailNotifications}
        >
          <FieldHelp slug="settings-email-notifications" tip="Email alerts for events" />
        </SettingsToggle>

        <SettingsToggle
          label="In-App Notifications"
          description="Show notifications within the application"
          checked={inAppNotifications}
          onCheckedChange={setInAppNotifications}
        >
          <FieldHelp slug="settings-inapp-notifications" tip="In-app alerts and badges" />
        </SettingsToggle>
      </div>

      {msg && <StatusMessage message={msg.text} type={msg.type} />}

      <LoadingButton onClick={handleSave} loading={preferencesSaving}>
        Save Preferences
      </LoadingButton>
    </div>
  );
}
