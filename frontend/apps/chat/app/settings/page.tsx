"use client";

import { useEffect } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TooltipProvider,
} from "@workstation/ui";
import { useAuth, useSettings, useResources } from "@workstation/api/hooks";
import { Loader2 } from "lucide-react";
import { PromptLibrary } from "@/components/context/prompt-library";
import { SnippetLibrary } from "@/components/context/snippet-library";
import { t } from "@/lib/i18n";

import { ProfileTab } from "./tabs/profile-tab";
import { SecurityTab } from "./tabs/security-tab";
import { NotificationsTab } from "./tabs/notifications-tab";
import { AiPreferencesTab } from "./tabs/ai-preferences-tab";
import { ImageGenTab } from "./tabs/image-gen-tab";
import { ResourcesTab } from "./tabs/resources-tab";
import { AppearanceTab } from "./tabs/appearance-tab";

export default function SettingsPage() {
  const { userId } = useAuth();
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

  useEffect(() => {
    if (userId) fetchResourcePreference(userId);
  }, [userId, fetchResourcePreference]);

  const isLoading = userLoading || preferencesLoading;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-full flex-col overflow-auto p-6 md:p-8 max-w-3xl mx-auto w-full">
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
        <Tabs defaultValue="profile" className="w-full">
          <TabsList aria-label="Settings sections" className="w-full flex flex-wrap gap-1">
            <TabsTrigger value="profile">{t("profile")}</TabsTrigger>
            <TabsTrigger value="security">{t("security")}</TabsTrigger>
            <TabsTrigger value="notifications">{t("notifications")}</TabsTrigger>
            <TabsTrigger value="ai">{t("ai")}</TabsTrigger>
            <TabsTrigger value="prompts">{t("prompts")}</TabsTrigger>
            <TabsTrigger value="snippets">{t("snippets")}</TabsTrigger>
            <TabsTrigger value="image-gen">{t("imageGen")}</TabsTrigger>
            <TabsTrigger value="resources">{t("resources")}</TabsTrigger>
            <TabsTrigger value="appearance">{t("appearance")}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab
              user={user}
              updateProfile={updateProfile}
              profileSaving={profileSaving}
            />
          </TabsContent>

          <TabsContent value="security">
            <SecurityTab
              changePassword={changePassword}
              passwordSaving={passwordSaving}
            />
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

          <TabsContent value="prompts" className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">System Prompts</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Create and manage reusable system prompts. Assign them to projects or individual chats.
              </p>
            </div>
            <PromptLibrary />
          </TabsContent>

          <TabsContent value="snippets" className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Context Snippets</h2>
              <p className="text-sm text-muted-foreground mb-6">
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
        </Tabs>
      )}
    </div>
    </TooltipProvider>
  );
}

