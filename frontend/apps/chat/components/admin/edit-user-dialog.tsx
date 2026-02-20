"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@workstation/ui";
import type { AdminUser, AdminUserUpdateRequest } from "@workstation/api/types";
import { FieldHelp } from "@/components/help/field-help";

interface EditUserDialogProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (userId: string, data: AdminUserUpdateRequest) => Promise<void>;
}

export function EditUserDialog({
  user,
  open,
  onOpenChange,
  onSave,
}: EditUserDialogProps) {
  const [role, setRole] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [screenName, setScreenName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && open) {
      setRole(user.role);
      setIsActive(user.is_active);
      setFirstName(user.first_name ?? "");
      setLastName(user.last_name ?? "");
      setScreenName(user.screen_name ?? "");
      setEmail(user.email ?? "");
      setError(null);
    }
  }, [user, open]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const data: AdminUserUpdateRequest = {};
      if (role !== user.role) data.role = role;
      if (isActive !== user.is_active) data.is_active = isActive;
      if (firstName !== (user.first_name ?? "")) data.first_name = firstName;
      if (lastName !== (user.last_name ?? "")) data.last_name = lastName;
      if (screenName !== (user.screen_name ?? "")) data.screen_name = screenName;
      if (email !== (user.email ?? "")) data.email = email;
      await onSave(user.id, data);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Edit User: {user?.username}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Update user details. Master users cannot be modified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                <span className="inline-flex items-center gap-1.5">
                  First Name
                  <FieldHelp
                    slug="settings-first-name"
                    tip="Used to identify this user in activity feeds and admin views."
                  />
                </span>
              </label>
              <Input
                className="h-8 text-xs"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                <span className="inline-flex items-center gap-1.5">
                  Last Name
                  <FieldHelp
                    slug="settings-last-name"
                    tip="Shown with first name across user lists and notifications."
                  />
                </span>
              </label>
              <Input
                className="h-8 text-xs"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
              <span className="inline-flex items-center gap-1.5">
                Screen Name
                <FieldHelp
                  slug="settings-display-name"
                  tip="Display name shown in chat and collaboration surfaces."
                />
              </span>
            </label>
            <Input
              className="h-8 text-xs"
              value={screenName}
              onChange={(e) => setScreenName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
              <span className="inline-flex items-center gap-1.5">
                Email
                <FieldHelp
                  slug="settings-email"
                  tip="Login and notification address for this user."
                />
              </span>
            </label>
            <Input
              className="h-8 text-xs"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                <span className="inline-flex items-center gap-1.5">
                  Role
                  <FieldHelp
                    slug="admin-user-role"
                    tip="Controls this user's access level across the platform."
                  />
                </span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                <span className="inline-flex items-center gap-1.5">
                  Status
                  <FieldHelp
                    slug="admin-user-status"
                    tip="Active users can sign in; inactive users are blocked."
                  />
                </span>
              </label>
              <select
                value={String(isActive)}
                onChange={(e) => setIsActive(e.target.value === "true")}
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-[10px] text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
