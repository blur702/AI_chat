"use client";

import { useCallback, useEffect, useState } from "react";
import { getClient } from "../client";
import type {
  AdminUser,
  AdminUserListParams,
  AdminUserListResponse,
  AdminUserUpdateRequest,
  AdminUserUpdateResponse,
  UserUnlockResponse,
} from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseUserManagementReturn {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  params: AdminUserListParams;
  setParams: (params: AdminUserListParams) => void;
  refreshUsers: () => Promise<void>;
  getUserDetails: (userId: string) => Promise<AdminUser>;
  updateUser: (userId: string, data: AdminUserUpdateRequest) => Promise<AdminUserUpdateResponse>;
  unlockUser: (userId: string) => Promise<UserUnlockResponse>;
  selectedUser: AdminUser | null;
  setSelectedUser: (user: AdminUser | null) => void;
  detailLoading: boolean;
  detailError: string | null;
  selectAndLoadUser: (userId: string) => Promise<void>;
}

/**
 * Manages the admin user list with pagination, sorting, search, detail loading, update, and unlock operations.
 * @returns Paginated user list, selected user detail, loading/error state, and admin CRUD functions.
 */
export function useUserManagement(): UseUserManagementReturn {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParamsState] = useState<AdminUserListParams>({
    page: 1,
    page_size: 20,
    sort_by: "created_at",
    sort_order: "desc",
  });
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const setParams = useCallback((newParams: AdminUserListParams) => {
    setParamsState((prev) => ({ ...prev, ...newParams }));
  }, []);

  const refreshUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: AdminUserListResponse = await getClient().listUsers(params);
      setUsers(data.users);
      setTotal(data.total);
      setPage(data.page);
      setPageSize(data.page_size);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }, [params]);

  const getUserDetailsFn = useCallback(async (userId: string) => {
    return getClient().getUserDetails(userId);
  }, []);

  const updateUserFn = useCallback(async (userId: string, data: AdminUserUpdateRequest) => {
    const result = await getClient().updateUserAsAdmin(userId, data);
    await refreshUsers();
    return result;
  }, [refreshUsers]);

  const unlockUserFn = useCallback(async (userId: string) => {
    const result = await getClient().unlockUser(userId);
    await refreshUsers();
    return result;
  }, [refreshUsers]);

  const selectAndLoadUser = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const user = await getClient().getUserDetails(userId);
      setSelectedUser(user);
    } catch (err) {
      setDetailError(extractErrorMessage(err, "Failed to load user details"));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  return {
    users,
    total,
    page,
    pageSize,
    loading,
    error,
    params,
    setParams,
    refreshUsers,
    getUserDetails: getUserDetailsFn,
    updateUser: updateUserFn,
    unlockUser: unlockUserFn,
    selectedUser,
    setSelectedUser,
    detailLoading,
    detailError,
    selectAndLoadUser,
  };
}
