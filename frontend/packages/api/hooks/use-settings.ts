"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  UserResponse,
  UserUpdateRequest,
  UserPreferences,
  UserPreferencesUpdateRequest,
  ModelInfo,
  PasswordChangeResponse,
} from "../types";

interface UseSettingsReturn {
  // User profile
  user: UserResponse | null;
  userLoading: boolean;
  updateProfile: (data: UserUpdateRequest) => Promise<{ success: boolean; error?: string }>;
  profileSaving: boolean;

  // Password
  changePassword: (current: string, newPwd: string) => Promise<{ success: boolean; error?: string; data?: PasswordChangeResponse }>;
  passwordSaving: boolean;

  // Preferences
  preferences: UserPreferences | null;
  preferencesLoading: boolean;
  updatePreferences: (data: UserPreferencesUpdateRequest) => Promise<{ success: boolean; error?: string }>;
  preferencesSaving: boolean;

  // Models
  models: ModelInfo[];
  modelsLoading: boolean;

  // Refresh
  refreshUser: () => Promise<void>;
  refreshPreferences: () => Promise<void>;
  refreshModels: () => Promise<void>;
}

/**
 * Manages user profile, password, preferences, and available model list for the settings page.
 * @param userId - The authenticated user's ID; pass `null` to skip initial fetches.
 * @returns User data, preferences, model list, saving flags, and update/change-password functions.
 */
export function useSettings(userId: string | null): UseSettingsReturn {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [userLoading, setUserLoading] = useState(!!userId);
  const [profileSaving, setProfileSaving] = useState(false);

  const [passwordSaving, setPasswordSaving] = useState(false);

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(!!userId);
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(!!userId);

  const client = getClient();

  const refreshUser = useCallback(async () => {
    if (!userId) return;
    setUserLoading(true);
    try {
      const data = await client.getCurrentUser();
      setUser(data);
    } catch {
      // User data unavailable
    } finally {
      setUserLoading(false);
    }
  }, [userId, client]);

  const refreshPreferences = useCallback(async () => {
    if (!userId) return;
    setPreferencesLoading(true);
    try {
      const data = await client.getUserPreferences(userId);
      setPreferences(data);
    } catch {
      // Preferences unavailable
    } finally {
      setPreferencesLoading(false);
    }
  }, [userId, client]);

  const refreshModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const data = await client.listModels();
      setModels(data.models);
    } catch {
      // Models unavailable
    } finally {
      setModelsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (userId) {
      refreshUser();
      refreshPreferences();
      refreshModels();
    }
  }, [userId, refreshUser, refreshPreferences, refreshModels]);

  const updateProfile = useCallback(
    async (data: UserUpdateRequest) => {
      if (!userId) return { success: false, error: "Not authenticated" };
      setProfileSaving(true);
      try {
        const updated = await client.updateUser(userId, data);
        setUser(updated);
        return { success: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to update profile";
        return { success: false, error: message };
      } finally {
        setProfileSaving(false);
      }
    },
    [userId, client]
  );

  const changePassword = useCallback(
    async (current: string, newPwd: string) => {
      setPasswordSaving(true);
      try {
        const data = await client.changePassword(current, newPwd);
        return { success: true, data };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to change password";
        return { success: false, error: message };
      } finally {
        setPasswordSaving(false);
      }
    },
    [client]
  );

  const updatePreferences = useCallback(
    async (data: UserPreferencesUpdateRequest) => {
      if (!userId) return { success: false, error: "Not authenticated" };
      setPreferencesSaving(true);
      try {
        const updated = await client.updateUserPreferences(userId, data);
        setPreferences(updated);
        return { success: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to update preferences";
        return { success: false, error: message };
      } finally {
        setPreferencesSaving(false);
      }
    },
    [userId, client]
  );

  return {
    user,
    userLoading,
    updateProfile,
    profileSaving,
    changePassword,
    passwordSaving,
    preferences,
    preferencesLoading,
    updatePreferences,
    preferencesSaving,
    models,
    modelsLoading,
    refreshUser,
    refreshPreferences,
    refreshModels,
  };
}
