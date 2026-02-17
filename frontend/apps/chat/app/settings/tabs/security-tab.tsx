"use client";

import { useState } from "react";
import { Input, LoadingButton, StatusMessage } from "@workstation/ui";
import { Eye, EyeOff } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

interface SecurityTabProps {
  changePassword: (current: string, newPwd: string) => Promise<{ success: boolean; error?: string }>;
  passwordSaving: boolean;
}

export function SecurityTab({ changePassword, passwordSaving }: SecurityTabProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleSave = async () => {
    setMsg(null);

    if (newPassword.length < 8) {
      setMsg({ text: "New password must be at least 8 characters", type: "error" });
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setMsg({ text: "Password must contain at least one uppercase letter", type: "error" });
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setMsg({ text: "Password must contain at least one lowercase letter", type: "error" });
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setMsg({ text: "Password must contain at least one digit", type: "error" });
      return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setMsg({ text: "Password must contain at least one special character", type: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ text: "Passwords do not match", type: "error" });
      return;
    }
    if (currentPassword === newPassword) {
      setMsg({ text: "New password must be different from current password", type: "error" });
      return;
    }

    const result = await changePassword(currentPassword, newPassword);
    if (result.success) {
      setMsg({ text: "Password changed successfully", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setMsg({ text: result.error ?? "Failed to change password", type: "error" });
    }
  };

  return (
    <div className="space-y-6 pt-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Security</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Change your password and manage security settings.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="currentPassword" className="text-sm font-medium flex items-center gap-1.5">
            Current Password
            <FieldHelp slug="settings-password" tip="Choose a strong password" />
          </label>
          <div className="relative">
            <Input
              id="currentPassword"
              type={showCurrentPwd ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPwd(!showCurrentPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showCurrentPwd ? "Hide password" : "Show password"}
            >
              {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="newPassword" className="text-sm font-medium">New Password</label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showNewPwd ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              aria-describedby="passwordRequirements"
            />
            <button
              type="button"
              onClick={() => setShowNewPwd(!showNewPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showNewPwd ? "Hide password" : "Show password"}
            >
              {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm New Password</label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />
        </div>

        <div
          id="passwordRequirements"
          className="text-xs text-muted-foreground space-y-1 rounded-md border p-3"
        >
          <p className="font-medium mb-1">Password requirements:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Minimum 8 characters</li>
            <li>At least 1 uppercase letter</li>
            <li>At least 1 lowercase letter</li>
            <li>At least 1 digit</li>
            <li>At least 1 special character</li>
          </ul>
        </div>
      </div>

      {msg && <StatusMessage message={msg.text} type={msg.type} />}

      <LoadingButton
        onClick={handleSave}
        loading={passwordSaving}
        disabled={!currentPassword || !newPassword || !confirmPassword}
      >
        Change Password
      </LoadingButton>
    </div>
  );
}
