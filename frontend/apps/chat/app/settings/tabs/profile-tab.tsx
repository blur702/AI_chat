"use client";

import { useState, useEffect } from "react";
import { Button, Input, LoadingButton, StatusMessage } from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";
import type { UserResponse } from "@workstation/api/types";

interface ProfileTabProps {
  user: UserResponse | null;
  updateProfile: (data: {
    first_name?: string;
    last_name?: string;
    screen_name?: string;
    email?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  profileSaving: boolean;
}

export function ProfileTab({ user, updateProfile, profileSaving }: ProfileTabProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [screenName, setScreenName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name ?? "");
      setLastName(user.last_name ?? "");
      setScreenName(user.screen_name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

  const handleSave = async () => {
    setMsg(null);
    const result = await updateProfile({
      first_name: firstName,
      last_name: lastName,
      screen_name: screenName,
      email: email || undefined,
    });
    if (result.success) {
      setMsg({ text: "Profile updated successfully", type: "success" });
    } else {
      setMsg({ text: result.error ?? "Failed to update profile", type: "error" });
    }
  };

  return (
    <div className="space-y-6 pt-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Profile</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Update your personal information.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="firstName" className="text-sm font-medium flex items-center gap-1.5">
              First Name
              <FieldHelp slug="settings-first-name" tip="Shown in chat threads, audit logs, and collaboration views. For example, 'Kevin' appears next to your messages and activity entries." />
            </label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="lastName" className="text-sm font-medium flex items-center gap-1.5">
              Last Name
              <FieldHelp slug="settings-last-name" tip="Paired with first name in user lists, notifications, and admin views. Use your team-recognized surname for easier support requests." />
            </label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="screenName" className="text-sm font-medium flex items-center gap-1.5">
            Display Name
            <FieldHelp slug="settings-display-name" tip="Appears in chat threads and activity feeds instead of your username. For example, 'KA' or 'Kevin A' — does not change your login identity." />
          </label>
          <Input
            id="screenName"
            value={screenName}
            onChange={(e) => setScreenName(e.target.value)}
            placeholder="Display name"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium flex items-center gap-1.5">
            Email
            <FieldHelp slug="settings-email" tip="Used for login, password recovery, and task alerts like generation completion. Use an inbox you actively monitor to avoid missing failure notices." />
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground inline-flex items-center gap-1.5">
            Username
            <FieldHelp
              slug="settings-username"
              tip="Unique account handle used for login and identity references."
            />
          </label>
          <Input value={user?.username ?? ""} disabled />
          <p className="text-xs text-muted-foreground">Username cannot be changed.</p>
        </div>
      </div>

      {msg && <StatusMessage message={msg.text} type={msg.type} />}

      <LoadingButton onClick={handleSave} loading={profileSaving}>
        Save Profile
      </LoadingButton>
    </div>
  );
}
