"use client";

import { useState } from "react";
import { useUserManagement } from "@workstation/api/hooks";
import { AlertCircle, RefreshCw, Users } from "lucide-react";
import { Button, cn } from "@workstation/ui";
import type { AdminUser, AdminUserUpdateRequest } from "@workstation/api/types";
import { UserTable } from "./user-table";
import { UserDetailsPanel } from "./user-details-panel";
import { EditUserDialog } from "./edit-user-dialog";
import { UnlockUserDialog } from "./unlock-user-dialog";

export function UserManagement() {
  const {
    users,
    total,
    page,
    pageSize,
    loading,
    error,
    params,
    setParams,
    refreshUsers,
    updateUser,
    unlockUser,
    selectedUser,
    setSelectedUser,
    detailLoading,
    detailError,
    selectAndLoadUser,
  } = useUserManagement();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<AdminUser | null>(null);

  const handleSelectUser = (user: AdminUser) => {
    selectAndLoadUser(user.id);
  };

  const handleEditUser = (user: AdminUser) => {
    setEditTarget(user);
    setEditDialogOpen(true);
  };

  const handleSaveUser = async (userId: string, data: AdminUserUpdateRequest) => {
    await updateUser(userId, data);
    if (selectedUser?.id === userId) {
      selectAndLoadUser(userId);
    }
  };

  const handleUnlockUser = (user: AdminUser) => {
    setUnlockTarget(user);
    setUnlockDialogOpen(true);
  };

  const handleUnlockConfirm = async (userId: string) => {
    await unlockUser(userId);
    if (selectedUser?.id === userId) {
      selectAndLoadUser(userId);
    }
  };

  const handleBack = () => {
    setSelectedUser(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">User Management</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshUsers}
          disabled={loading}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {selectedUser ? (
        <UserDetailsPanel
          user={selectedUser}
          loading={detailLoading}
          error={detailError}
          onBack={handleBack}
          onEdit={handleEditUser}
          onUnlock={handleUnlockUser}
        />
      ) : (
        <UserTable
          users={users}
          total={total}
          page={page}
          pageSize={pageSize}
          loading={loading}
          params={params}
          onParamsChange={setParams}
          onSelectUser={handleSelectUser}
          onEditUser={handleEditUser}
          onUnlockUser={handleUnlockUser}
        />
      )}

      <EditUserDialog
        user={editTarget}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={handleSaveUser}
      />

      <UnlockUserDialog
        user={unlockTarget}
        open={unlockDialogOpen}
        onOpenChange={setUnlockDialogOpen}
        onUnlock={handleUnlockConfirm}
      />
    </div>
  );
}
