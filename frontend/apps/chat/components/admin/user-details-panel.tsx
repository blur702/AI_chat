"use client";

import { Badge, Button, cn, Skeleton } from "@workstation/ui";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import type { AdminUser } from "@workstation/api/types";

interface UserDetailsPanelProps {
  user: AdminUser | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onEdit: (user: AdminUser) => void;
  onUnlock: (user: AdminUser) => void;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-1.5">
      <span className="text-[10px] text-muted-foreground shrink-0">
        {label}
      </span>
      <span className="text-xs text-right ml-4">{value}</span>
    </div>
  );
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserDetailsPanel({
  user,
  loading,
  error,
  onBack,
  onEdit,
  onUnlock,
}: UserDetailsPanelProps) {
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-xs text-destructive">
        <p>{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
            {user.is_master ? (
              <ShieldCheck className="h-4 w-4 text-amber-500" />
            ) : user.role === "admin" ? (
              <Shield className="h-4 w-4 text-blue-500" />
            ) : (
              <UserIcon className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{user.username}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {user.email ?? "No email"}
            </p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {!user.is_master && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onEdit(user)}>
              Edit
            </Button>
          )}
          {user.locked_until && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-amber-600"
              onClick={() => onUnlock(user)}
            >
              Unlock
            </Button>
          )}
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            user.role === "admin"
              ? "text-blue-600 border-blue-500/30"
              : "text-muted-foreground"
          )}
        >
          {user.role}
        </Badge>
        {user.is_active ? (
          <Badge
            variant="outline"
            className="text-[10px] text-green-600 border-green-500/30"
          >
            Active
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] text-yellow-600 border-yellow-500/30"
          >
            Inactive
          </Badge>
        )}
        {user.is_master && (
          <Badge
            variant="outline"
            className="text-[10px] text-amber-600 border-amber-500/30"
          >
            Master
          </Badge>
        )}
        {user.locked_until && (
          <Badge
            variant="outline"
            className="text-[10px] text-red-600 border-red-500/30"
          >
            <Lock className="h-2.5 w-2.5 mr-1" />
            Locked
          </Badge>
        )}
        {user.email_verified && (
          <Badge
            variant="outline"
            className="text-[10px] text-green-600 border-green-500/30"
          >
            <Mail className="h-2.5 w-2.5 mr-1" />
            Verified
          </Badge>
        )}
      </div>

      {/* Info Sections */}
      <div className="space-y-3">
        <div className="rounded-md border p-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Profile
          </h4>
          <div className="divide-y">
            <DetailRow label="First Name" value={user.first_name ?? "—"} />
            <DetailRow label="Last Name" value={user.last_name ?? "—"} />
            <DetailRow label="Screen Name" value={user.screen_name ?? "—"} />
            <DetailRow label="Email" value={user.email ?? "—"} />
          </div>
        </div>

        <div className="rounded-md border p-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Security
          </h4>
          <div className="divide-y">
            <DetailRow
              label="Failed Login Attempts"
              value={user.failed_login_attempts}
            />
            <DetailRow
              label="Locked Until"
              value={formatDateTime(user.locked_until)}
            />
            <DetailRow
              label="Last Password Change"
              value={formatDateTime(user.last_password_change)}
            />
            <DetailRow
              label="Email Verified"
              value={user.email_verified ? "Yes" : "No"}
            />
          </div>
        </div>

        <div className="rounded-md border p-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Timestamps
          </h4>
          <div className="divide-y">
            <DetailRow
              label="Last Login"
              value={formatDateTime(user.last_login_at)}
            />
            <DetailRow
              label="Created"
              value={formatDateTime(user.created_at)}
            />
            <DetailRow
              label="Updated"
              value={formatDateTime(user.updated_at)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
