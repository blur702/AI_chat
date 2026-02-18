"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TooltipProvider,
} from "@workstation/ui";
import { useAuth, useSettings, useResources, useAdmin } from "@workstation/api/hooks";
import { AlertCircle, Loader2 } from "lucide-react";
import { PromptLibrary } from "@/components/context/prompt-library";
import { SnippetLibrary } from "@/components/context/snippet-library";
import { t } from "@/lib/i18n";

// Admin components
import { RefreshControl } from "@/components/admin/refresh-control";
import { QuickStats } from "@/components/admin/quick-stats";
import { SystemMetrics } from "@/components/admin/system-metrics";
import { ServiceHealth } from "@/components/admin/service-health";
import { UserManagement } from "@/components/admin/user-management";
import { AuditLogs } from "@/components/admin/audit-logs";
import { EventStats } from "@/components/admin/event-stats";
import { HelpTopicManagement } from "@/components/admin/help-topic-management";
import { ImageModelManagement } from "@/components/admin/image-model-management";
import { NotesManagement } from "@/components/admin/notes-management";
import { VramManagement } from "@/components/admin/vram-management";

// Settings tabs
import { ProfileTab } from "./tabs/profile-tab";
import { SecurityTab } from "./tabs/security-tab";
import { NotificationsTab } from "./tabs/notifications-tab";
import { AiPreferencesTab } from "./tabs/ai-preferences-tab";
import { ChatModesTab } from "./tabs/chat-modes-tab";
import { ImageGenTab } from "./tabs/image-gen-tab";
import { ResourcesTab } from "./tabs/resources-tab";
import { AppearanceTab } from "./tabs/appearance-tab";

function isAdminTab(tab: string): boolean {
  return tab.startsWith("admin-");
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const { userId, role } = useAuth();
  const isAdmin = role === "admin";

  // Derive initial tab from URL (supports ?tab=admin-system etc.)
  const urlTab = searchParams.get("tab") ?? "profile";
  const initialTab = !isAdmin && urlTab.startsWith("admin-") ? "profile" : urlTab;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync tab from URL changes
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setActiveTab(!isAdmin && t.startsWith("admin-") ? "profile" : t);
  }, [searchParams, isAdmin]);

  const {
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
  } = useSettings(userId);

  const {
    preference: resourcePreference,
    preferenceLoading: resourcePreferenceLoading,
    fetchPreference: fetchResourcePreference,
    setPreference: setResourcePreference,
  } = useResources();

  // Fetch admin data only when user is admin (avoids 403 requests)
  const adminData = useAdmin(isAdmin);

  useEffect(() => {
    if (userId) fetchResourcePreference(userId);
  }, [userId, fetchResourcePreference]);

  const isLoading = userLoading || preferencesLoading;

  const handleAdminRefresh = () => {
    adminData.refreshMetrics();
    adminData.refreshDebugInfo();
  };

  // Use wider layout for admin tabs
  const isWide = isAdminTab(activeTab);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`mx-auto flex h-full w-full flex-col overflow-auto p-6 md:p-8 ${
          isWide ? "max-w-6xl" : "max-w-3xl"
        }`}
      >
        <div className="mb-6">
          <h1 className="text-sm font-semibold">{t("settingsTitle")}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage your profile, preferences, and configuration.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList aria-label="Settings sections" className="flex w-full flex-wrap gap-1">
              <TabsTrigger value="profile">{t("profile")}</TabsTrigger>
              <TabsTrigger value="security">{t("security")}</TabsTrigger>
              <TabsTrigger value="notifications">{t("notifications")}</TabsTrigger>
              <TabsTrigger value="ai">{t("ai")}</TabsTrigger>
              <TabsTrigger value="chat-modes">{t("chatModes")}</TabsTrigger>
              <TabsTrigger value="prompts">{t("prompts")}</TabsTrigger>
              <TabsTrigger value="snippets">{t("snippets")}</TabsTrigger>
              <TabsTrigger value="image-gen">{t("imageGen")}</TabsTrigger>
              <TabsTrigger value="resources">{t("resources")}</TabsTrigger>
              <TabsTrigger value="appearance">{t("appearance")}</TabsTrigger>

              {isAdmin && (
                <>
                  <Separator orientation="vertical" className="mx-1 h-5" />
                  <TabsTrigger value="admin-system">System</TabsTrigger>
                  <TabsTrigger value="admin-users">Users</TabsTrigger>
                  <TabsTrigger value="admin-audit">Audit Logs</TabsTrigger>
                  <TabsTrigger value="admin-help">Help Topics</TabsTrigger>
                  <TabsTrigger value="admin-images">Image Models</TabsTrigger>
                  <TabsTrigger value="admin-notes">Notes</TabsTrigger>
                  <TabsTrigger value="admin-vram">VRAM</TabsTrigger>
                </>
              )}
            </TabsList>

            {/* --- Settings Tabs --- */}

            <TabsContent value="profile">
              <ProfileTab user={user} updateProfile={updateProfile} profileSaving={profileSaving} />
            </TabsContent>

            <TabsContent value="security">
              <SecurityTab changePassword={changePassword} passwordSaving={passwordSaving} />
            </TabsContent>

            <TabsContent value="notifications">
              <NotificationsTab
                preferences={preferences}
                updatePreferences={updatePreferences}
                preferencesSaving={preferencesSaving}
              />
            </TabsContent>

            <TabsContent value="ai">
              <AiPreferencesTab
                preferences={preferences}
                updatePreferences={updatePreferences}
                preferencesSaving={preferencesSaving}
                models={models}
                modelsLoading={modelsLoading}
              />
            </TabsContent>

            <TabsContent value="chat-modes">
              <ChatModesTab
                preferences={preferences}
                updatePreferences={updatePreferences}
                preferencesSaving={preferencesSaving}
              />
            </TabsContent>

            <TabsContent value="prompts" className="space-y-6 pt-6">
              <div>
                <h2 className="mb-1 text-lg font-semibold">System Prompts</h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  Create and manage reusable system prompts. Assign them to projects or individual
                  chats.
                </p>
              </div>
              <PromptLibrary />
            </TabsContent>

            <TabsContent value="snippets" className="space-y-6 pt-6">
              <div>
                <h2 className="mb-1 text-lg font-semibold">Context Snippets</h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  Create reusable text snippets to quickly insert into context layers.
                </p>
              </div>
              <SnippetLibrary />
            </TabsContent>

            <TabsContent value="image-gen">
              <ImageGenTab
                preferences={preferences}
                updatePreferences={updatePreferences}
                preferencesSaving={preferencesSaving}
              />
            </TabsContent>

            <TabsContent value="resources">
              <ResourcesTab
                userId={userId}
                resourcePreference={resourcePreference}
                resourcePreferenceLoading={resourcePreferenceLoading}
                setResourcePreference={setResourcePreference}
              />
            </TabsContent>

            <TabsContent value="appearance">
              <AppearanceTab />
            </TabsContent>

            {/* --- Admin Tabs (only rendered for admins) --- */}

            {isAdmin && (
              <>
                <TabsContent value="admin-system" className="mt-4 space-y-6">
                  <RefreshControl
                    onRefresh={handleAdminRefresh}
                    loading={adminData.loading}
                    lastUpdated={adminData.lastUpdated}
                    autoRefreshEnabled={adminData.autoRefreshEnabled}
                    onAutoRefreshChange={adminData.setAutoRefreshEnabled}
                    autoRefreshInterval={adminData.autoRefreshInterval}
                    onIntervalChange={adminData.setAutoRefreshInterval}
                  />
                  {adminData.error && (
                    <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{adminData.error}</span>
                    </div>
                  )}
                  <QuickStats metrics={adminData.metrics} />
                  <EventStats />
                  <SystemMetrics metrics={adminData.metrics} />
                  <ServiceHealth
                    debugInfo={adminData.debugInfo}
                    getServiceDebug={adminData.getServiceDebug}
                  />
                </TabsContent>

                <TabsContent value="admin-users" className="mt-4">
                  <UserManagement />
                </TabsContent>

                <TabsContent value="admin-audit" className="mt-4">
                  <AuditLogs />
                </TabsContent>

                <TabsContent value="admin-help" className="mt-4">
                  <HelpTopicManagement />
                </TabsContent>

                <TabsContent value="admin-images" className="mt-4">
                  <ImageModelManagement />
                </TabsContent>

                <TabsContent value="admin-notes" className="mt-4">
                  <NotesManagement />
                </TabsContent>

                <TabsContent value="admin-vram" className="mt-4">
                  <VramManagement />
                </TabsContent>
              </>
            )}
          </Tabs>
        )}
      </div>
    </TooltipProvider>
  );
}
