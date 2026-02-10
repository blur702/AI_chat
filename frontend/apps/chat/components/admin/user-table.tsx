"use client";

import { Badge, Button, cn, Input } from "@workstation/ui";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Lock,
  Search,
  Shield,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import type { AdminUser, AdminUserListParams } from "@workstation/api/types";

interface UserTableProps {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  params: AdminUserListParams;
  onParamsChange: (params: AdminUserListParams) => void;
  onSelectUser: (user: AdminUser) => void;
  onEditUser: (user: AdminUser) => void;
  onUnlockUser: (user: AdminUser) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function UserTable({
  users,
  total,
  page,
  pageSize,
  loading,
  params,
  onParamsChange,
  onSelectUser,
  onEditUser,
  onUnlockUser,
}: UserTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSort = (field: string) => {
    if (params.sort_by === field) {
      onParamsChange({
        sort_order: params.sort_order === "asc" ? "desc" : "asc",
      });
    } else {
      onParamsChange({ sort_by: field, sort_order: "asc" });
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (params.sort_by !== field) return null;
    return params.sort_order === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  return (
    <div className="space-y-3">
      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            className="h-8 pl-8 text-xs"
            value={params.search ?? ""}
            onChange={(e) =>
              onParamsChange({ search: e.target.value || undefined, page: 1 })
            }
          />
        </div>
        <select
          value={params.role ?? ""}
          onChange={(e) =>
            onParamsChange({ role: e.target.value || undefined, page: 1 })
          }
          className="h-8 rounded-md border bg-background px-2 text-xs"
          aria-label="Filter by role"
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
        <select
          value={params.is_active === undefined ? "" : String(params.is_active)}
          onChange={(e) =>
            onParamsChange({
              is_active:
                e.target.value === "" ? undefined : e.target.value === "true",
              page: 1,
            })
          }
          className="h-8 rounded-md border bg-background px-2 text-xs"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th
                  className="px-3 py-2 text-left font-medium cursor-pointer select-none"
                  onClick={() => handleSort("username")}
                >
                  <span className="flex items-center gap-1">
                    User <SortIcon field="username" />
                  </span>
                </th>
                <th
                  className="px-3 py-2 text-left font-medium cursor-pointer select-none"
                  onClick={() => handleSort("role")}
                >
                  <span className="flex items-center gap-1">
                    Role <SortIcon field="role" />
                  </span>
                </th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th
                  className="px-3 py-2 text-left font-medium cursor-pointer select-none"
                  onClick={() => handleSort("last_login_at")}
                >
                  <span className="flex items-center gap-1">
                    Last Login <SortIcon field="last_login_at" />
                  </span>
                </th>
                <th
                  className="px-3 py-2 text-left font-medium cursor-pointer select-none"
                  onClick={() => handleSort("created_at")}
                >
                  <span className="flex items-center gap-1">
                    Created <SortIcon field="created_at" />
                  </span>
                </th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="h-4 bg-muted/50 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => onSelectUser(user)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0">
                          {user.is_master ? (
                            <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
                          ) : user.role === "admin" ? (
                            <Shield className="h-3.5 w-3.5 text-blue-500" />
                          ) : (
                            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{user.username}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {user.email ?? "No email"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
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
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {user.locked_until ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-red-600 border-red-500/30"
                          >
                            <Lock className="h-2.5 w-2.5 mr-1" />
                            Locked
                          </Badge>
                        ) : user.is_active ? (
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
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {formatDate(user.last_login_at)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!user.is_master && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => onEditUser(user)}
                          >
                            Edit
                          </Button>
                        )}
                        {user.locked_until && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] text-amber-600"
                            onClick={() => onUnlockUser(user)}
                          >
                            Unlock
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {total} user{total !== 1 ? "s" : ""} total
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={page <= 1}
            onClick={() => onParamsChange({ page: page - 1 })}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={page >= totalPages}
            onClick={() => onParamsChange({ page: page + 1 })}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
