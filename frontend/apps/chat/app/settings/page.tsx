"use client";

import { useState, useEffect } from "react";
import {
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ThemeToggle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
} from "@workstation/ui";
import { useAuth, useSettings, useResources } from "@workstation/api/hooks";
import { ArrowLeft, Loader2, Check, AlertCircle, Eye, EyeOff, ImageIcon, HardDrive } from "lucide-react";
import { OffloadPreferences } from "@/components/resources/offload-preferences";
import { PromptLibrary } from "@/components/context/prompt-library";
import { SnippetLibrary } from "@/components/context/snippet-library";
import { FieldHelp } from "@/components/help/field-help";
import Link from "next/link";
import { t } from "@/lib/i18n";

function StatusMessage({ message, type }: { message: string; type: "success" | "error" }) {
  if (!message) return null;
  return (
    <div
      className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
        type === "success"
          ? "bg-green-500/10 text-green-600 dark:text-green-400"
          : "bg-destructive/10 text-destructive"
      }`}
      role="alert"
    >
      {type === "success" ? (
        <Check className="h-4 w-4 flex-shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
      )}
      {message}
    </div>
  );
}

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

  // Fetch resource preference on mount
  useEffect(() => {
    if (userId) fetchResourcePreference(userId);
  }, [userId, fetchResourcePreference]);

  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [screenName, setScreenName] = useState("");
  const [email, setEmail] = useState("");
  const [profileMsg, setProfileMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Notification form state
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [notifMsg, setNotifMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // AI preferences form state
  const [defaultModel, setDefaultModel] = useState("");
  const [defaultTemperature, setDefaultTemperature] = useState(0.7);
  const [defaultNumCtx, setDefaultNumCtx] = useState(4096);
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [aiMsg, setAiMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Image generation preferences form state
  const [imggenWorkflow, setImggenWorkflow] = useState("text-to-image");
  const [imggenWidth, setImggenWidth] = useState(512);
  const [imggenHeight, setImggenHeight] = useState(512);
  const [imggenSteps, setImggenSteps] = useState(20);
  const [imggenCfgScale, setImggenCfgScale] = useState(7.0);
  const [imggenPrompt, setImggenPrompt] = useState("");
  const [imggenSystemPrompt, setImggenSystemPrompt] = useState("");
  const [imggenNegativePrompt, setImggenNegativePrompt] = useState("");
  const [imggenCompletionNotif, setImggenCompletionNotif] = useState(true);
  const [imggenDesktopNotif, setImggenDesktopNotif] = useState(false);
  const [imggenSoundNotif, setImggenSoundNotif] = useState(false);
  const [imggenNotifSound, setImggenNotifSound] = useState("default");
  const [imggenAutoDeleteDays, setImggenAutoDeleteDays] = useState<number | "">("");
  const [imggenMaxGenerations, setImggenMaxGenerations] = useState<number | "">("");
  const [comfyuiBaseUrl, setComfyuiBaseUrl] = useState("");
  const [imggenMsg, setImggenMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Populate profile form when user data loads
  useEffect(() => {
    if (user) {
      setFirstName(user.first_name ?? "");
      setLastName(user.last_name ?? "");
      setScreenName(user.screen_name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

  // Populate preferences forms when preferences load
  useEffect(() => {
    if (preferences) {
      setEmailNotifications(preferences.email_notifications ?? true);
      setInAppNotifications(preferences.in_app_notifications ?? true);
      setDefaultModel(preferences.default_model ?? "");
      setDefaultTemperature(preferences.default_temperature ?? 0.7);
      setDefaultNumCtx(preferences.default_num_ctx ?? 4096);
      setCustomSystemPrompt(preferences.custom_system_prompt ?? "");
      setImggenWorkflow(preferences.imggen_default_workflow ?? "text-to-image");
      setImggenWidth(preferences.imggen_default_width ?? 512);
      setImggenHeight(preferences.imggen_default_height ?? 512);
      setImggenSteps(preferences.imggen_default_steps ?? 20);
      setImggenCfgScale(preferences.imggen_default_cfg_scale ?? 7.0);
      setImggenPrompt(preferences.imggen_default_prompt ?? "");
      setImggenSystemPrompt(preferences.imggen_system_prompt ?? "");
      setImggenNegativePrompt(preferences.imggen_default_negative_prompt ?? "");
      setImggenCompletionNotif(preferences.imggen_completion_notification ?? true);
      setImggenDesktopNotif(preferences.imggen_desktop_notification ?? false);
      setImggenSoundNotif(preferences.imggen_sound_notification ?? false);
      setImggenNotifSound(preferences.imggen_notification_sound ?? "default");
      setImggenAutoDeleteDays(preferences.imggen_auto_delete_days ?? "");
      setImggenMaxGenerations(preferences.imggen_max_generations ?? "");
      setComfyuiBaseUrl(preferences.comfyui_base_url ?? "");
    }
  }, [preferences]);

  const handleProfileSave = async () => {
    setProfileMsg(null);
    const result = await updateProfile({
      first_name: firstName,
      last_name: lastName,
      screen_name: screenName,
      email: email || undefined,
    });
    if (result.success) {
      setProfileMsg({ text: "Profile updated successfully", type: "success" });
    } else {
      setProfileMsg({ text: result.error ?? "Failed to update profile", type: "error" });
    }
  };

  const handlePasswordChange = async () => {
    setPasswordMsg(null);

    if (newPassword.length < 8) {
      setPasswordMsg({ text: "New password must be at least 8 characters", type: "error" });
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPasswordMsg({ text: "Password must contain at least one uppercase letter", type: "error" });
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setPasswordMsg({ text: "Password must contain at least one lowercase letter", type: "error" });
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setPasswordMsg({ text: "Password must contain at least one digit", type: "error" });
      return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setPasswordMsg({ text: "Password must contain at least one special character", type: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: "Passwords do not match", type: "error" });
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordMsg({ text: "New password must be different from current password", type: "error" });
      return;
    }

    const result = await changePassword(currentPassword, newPassword);
    if (result.success) {
      setPasswordMsg({ text: "Password changed successfully", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPasswordMsg({ text: result.error ?? "Failed to change password", type: "error" });
    }
  };

  const handleNotificationsSave = async () => {
    setNotifMsg(null);
    const result = await updatePreferences({
      email_notifications: emailNotifications,
      in_app_notifications: inAppNotifications,
    });
    if (result.success) {
      setNotifMsg({ text: "Notification preferences saved", type: "success" });
    } else {
      setNotifMsg({ text: result.error ?? "Failed to save preferences", type: "error" });
    }
  };

  const handleAiPreferencesSave = async () => {
    setAiMsg(null);
    const result = await updatePreferences({
      default_model: defaultModel || undefined,
      default_temperature: defaultTemperature,
      default_num_ctx: defaultNumCtx,
      custom_system_prompt: customSystemPrompt || undefined,
    });
    if (result.success) {
      setAiMsg({ text: "AI preferences saved", type: "success" });
    } else {
      setAiMsg({ text: result.error ?? "Failed to save AI preferences", type: "error" });
    }
  };

  const handleImggenPreferencesSave = async () => {
    setImggenMsg(null);
    const result = await updatePreferences({
      imggen_default_workflow: imggenWorkflow || undefined,
      imggen_default_width: imggenWidth,
      imggen_default_height: imggenHeight,
      imggen_default_steps: imggenSteps,
      imggen_default_cfg_scale: imggenCfgScale,
      imggen_default_prompt: imggenPrompt || undefined,
      imggen_system_prompt: imggenSystemPrompt || undefined,
      imggen_default_negative_prompt: imggenNegativePrompt || undefined,
      imggen_completion_notification: imggenCompletionNotif,
      imggen_desktop_notification: imggenDesktopNotif,
      imggen_sound_notification: imggenSoundNotif,
      imggen_notification_sound: imggenNotifSound || undefined,
      imggen_auto_delete_days: imggenAutoDeleteDays === "" ? undefined : imggenAutoDeleteDays,
      imggen_max_generations: imggenMaxGenerations === "" ? undefined : imggenMaxGenerations,
      comfyui_base_url: comfyuiBaseUrl || undefined,
    });
    if (result.success) {
      setImggenMsg({ text: "Image generation preferences saved", type: "success" });
    } else {
      setImggenMsg({ text: result.error ?? "Failed to save preferences", type: "error" });
    }
  };

  const isLoading = userLoading || preferencesLoading;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex min-h-screen flex-col p-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/chat">
          <Button variant="ghost" size="icon" aria-label="Back to chat">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{t("settingsTitle")}</h1>
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

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6 pt-6">
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
                    <FieldHelp slug="settings-first-name" tip="Your given name for personalization" />
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
                    <FieldHelp slug="settings-last-name" tip="Your family or surname" />
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
                  <FieldHelp slug="settings-display-name" tip="The name shown to others" />
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
                  <FieldHelp slug="settings-email" tip="Used for login and recovery" />
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
                <label className="text-sm font-medium text-muted-foreground">
                  Username
                </label>
                <Input value={user?.username ?? ""} disabled />
                <p className="text-xs text-muted-foreground">Username cannot be changed.</p>
              </div>
            </div>

            {profileMsg && <StatusMessage message={profileMsg.text} type={profileMsg.type} />}

            <Button onClick={handleProfileSave} disabled={profileSaving}>
              {profileSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("saveProfile")}
            </Button>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6 pt-6">
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
                <label htmlFor="newPassword" className="text-sm font-medium">
                  New Password
                </label>
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
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm New Password
                </label>
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

            {passwordMsg && <StatusMessage message={passwordMsg.text} type={passwordMsg.type} />}

            <Button
              onClick={handlePasswordChange}
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
            >
              {passwordSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("changePassword")}
            </Button>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Notifications</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Configure how you receive notifications.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    Email Notifications
                    <FieldHelp slug="settings-email-notifications" tip="Email alerts for events" />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={emailNotifications}
                  aria-label="Email Notifications"
                  onClick={() => setEmailNotifications(!emailNotifications)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    emailNotifications ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      emailNotifications ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    In-App Notifications
                    <FieldHelp slug="settings-inapp-notifications" tip="In-app alerts and badges" />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Show notifications within the application
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={inAppNotifications}
                  aria-label="In-App Notifications"
                  onClick={() => setInAppNotifications(!inAppNotifications)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    inAppNotifications ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      inAppNotifications ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {notifMsg && <StatusMessage message={notifMsg.text} type={notifMsg.type} />}

            <Button onClick={handleNotificationsSave} disabled={preferencesSaving}>
              {preferencesSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("savePreferences")}
            </Button>
          </TabsContent>

          {/* AI Preferences Tab */}
          <TabsContent value="ai" className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">AI Preferences</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Configure default model, temperature, and system prompt for AI responses.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="defaultModel" className="text-sm font-medium flex items-center gap-1.5">
                  Default Model
                  <FieldHelp slug="settings-default-model" tip="AI model for new conversations" />
                </label>
                <select
                  id="defaultModel"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  className="flex h-11 w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Auto (first available)</option>
                  {modelsLoading ? (
                    <option disabled>Loading models...</option>
                  ) : (
                    (models ?? []).map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="temperature" className="text-sm font-medium flex items-center gap-1.5">
                  Temperature: {defaultTemperature.toFixed(2)}
                  <FieldHelp slug="settings-default-temperature" tip="Controls response randomness" />
                </label>
                <input
                  id="temperature"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={defaultTemperature}
                  onChange={(e) => setDefaultTemperature(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Precise (0.0)</span>
                  <span>Creative (1.0)</span>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="numCtx" className="text-sm font-medium flex items-center gap-1.5">
                  Context Window: {defaultNumCtx >= 1024 ? `${Math.round(defaultNumCtx / 1024)}K` : defaultNumCtx.toLocaleString()} tokens
                  <FieldHelp slug="settings-default-num-ctx" tip="How much chat history the model can use" />
                </label>
                <input
                  id="numCtx"
                  type="range"
                  min="512"
                  max="131072"
                  step="512"
                  value={defaultNumCtx}
                  onChange={(e) => setDefaultNumCtx(parseInt(e.target.value, 10))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>512</span>
                  <span>128K</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Controls how much conversation history the model can see. Higher values use more VRAM.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="systemPrompt" className="text-sm font-medium flex items-center gap-1.5">
                  Custom System Prompt
                  <FieldHelp slug="settings-system-prompt" tip="Guide the AI's behavior" />
                </label>
                <textarea
                  id="systemPrompt"
                  value={customSystemPrompt}
                  onChange={(e) => setCustomSystemPrompt(e.target.value)}
                  placeholder="You are a helpful AI assistant..."
                  rows={5}
                  className="flex w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the default system prompt.
                </p>
              </div>
            </div>

            {aiMsg && <StatusMessage message={aiMsg.text} type={aiMsg.type} />}

            <Button onClick={handleAiPreferencesSave} disabled={preferencesSaving}>
              {preferencesSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("saveAiPreferences")}
            </Button>
          </TabsContent>

          {/* Prompts Tab */}
          <TabsContent value="prompts" className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">System Prompts</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Create and manage reusable system prompts. Assign them to projects or individual chats.
              </p>
            </div>
            <PromptLibrary />
          </TabsContent>

          {/* Snippets Tab */}
          <TabsContent value="snippets" className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Context Snippets</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Create reusable text snippets to quickly insert into context layers.
              </p>
            </div>
            <SnippetLibrary />
          </TabsContent>

          {/* Image Generation Tab */}
          <TabsContent value="image-gen" className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Image Generation</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Configure default settings for image generation with ComfyUI.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="imggenWorkflow" className="text-sm font-medium flex items-center gap-1.5">
                  Default Workflow
                  <FieldHelp slug="imagegen-workflow" tip="Image generation workflow type" />
                </label>
                <select
                  id="imggenWorkflow"
                  value={imggenWorkflow}
                  onChange={(e) => setImggenWorkflow(e.target.value)}
                  className="flex h-11 w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="text-to-image">Text to Image</option>
                  <option value="image-to-image">Image to Image</option>
                  <option value="inpainting">Inpainting</option>
                  <option value="face-morph">Face Morph</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="imggenWidth" className="text-sm font-medium flex items-center gap-1.5">
                    Default Width
                    <FieldHelp slug="imagegen-width" tip="Width in pixels" />
                  </label>
                  <Input
                    id="imggenWidth"
                    type="number"
                    min={64}
                    max={4096}
                    step={64}
                    value={imggenWidth}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      setImggenWidth(isNaN(parsed) ? 512 : parsed);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="imggenHeight" className="text-sm font-medium flex items-center gap-1.5">
                    Default Height
                    <FieldHelp slug="imagegen-height" tip="Height in pixels" />
                  </label>
                  <Input
                    id="imggenHeight"
                    type="number"
                    min={64}
                    max={4096}
                    step={64}
                    value={imggenHeight}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      setImggenHeight(isNaN(parsed) ? 512 : parsed);
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="imggenSteps" className="text-sm font-medium flex items-center gap-1.5">
                    Default Steps: {imggenSteps}
                    <FieldHelp slug="imagegen-steps" tip="More steps = better quality" />
                  </label>
                  <input
                    id="imggenSteps"
                    type="range"
                    min={1}
                    max={150}
                    step={1}
                    value={imggenSteps}
                    onChange={(e) => setImggenSteps(parseInt(e.target.value, 10))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span>150</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="imggenCfgScale" className="text-sm font-medium flex items-center gap-1.5">
                    CFG Scale: {imggenCfgScale.toFixed(1)}
                    <FieldHelp slug="imagegen-cfg-scale" tip="Prompt adherence strength" />
                  </label>
                  <input
                    id="imggenCfgScale"
                    type="range"
                    min={1}
                    max={30}
                    step={0.5}
                    value={imggenCfgScale}
                    onChange={(e) => setImggenCfgScale(parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1.0</span>
                    <span>30.0</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="imggenPrompt" className="text-sm font-medium">
                  Default Prompt
                </label>
                <textarea
                  id="imggenPrompt"
                  value={imggenPrompt}
                  onChange={(e) => setImggenPrompt(e.target.value)}
                  placeholder="a beautiful landscape, high quality, detailed..."
                  maxLength={2000}
                  rows={3}
                  className="flex w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">
                  Pre-filled when opening the image generation form. Leave empty to start with a blank prompt.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="imggenSystemPrompt" className="text-sm font-medium flex items-center gap-1.5">
                  Image System Context
                  <FieldHelp slug="imagegen-system-prompt" tip="Global style/rules applied before each image prompt" />
                </label>
                <textarea
                  id="imggenSystemPrompt"
                  value={imggenSystemPrompt}
                  onChange={(e) => setImggenSystemPrompt(e.target.value)}
                  placeholder="Use natural lighting, cinematic composition, high detail..."
                  maxLength={4000}
                  rows={4}
                  className="flex w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[96px]"
                />
                <p className="text-xs text-muted-foreground">
                  Separate from chat system prompt. This context is prepended to image generation prompts only.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="imggenNegativePrompt" className="text-sm font-medium flex items-center gap-1.5">
                  Default Negative Prompt
                  <FieldHelp slug="imagegen-negative-prompt" tip="What to avoid in images" />
                </label>
                <textarea
                  id="imggenNegativePrompt"
                  value={imggenNegativePrompt}
                  onChange={(e) => setImggenNegativePrompt(e.target.value)}
                  placeholder="blurry, low quality, distorted..."
                  maxLength={2000}
                  rows={3}
                  className="flex w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[80px]"
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Notifications</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        Completion Notification
                        <FieldHelp slug="imagegen-completion-notif" tip="Get notified when done" />
                      </p>
                      <p className="text-xs text-muted-foreground">Notify when generation completes</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={imggenCompletionNotif}
                      aria-label="Completion Notification"
                      onClick={() => setImggenCompletionNotif(!imggenCompletionNotif)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        imggenCompletionNotif ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        imggenCompletionNotif ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        Desktop Notification
                        <FieldHelp slug="imagegen-desktop-notif" tip="Browser desktop alerts" />
                      </p>
                      <p className="text-xs text-muted-foreground">Show browser desktop notification</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={imggenDesktopNotif}
                      aria-label="Desktop Notification"
                      onClick={() => setImggenDesktopNotif(!imggenDesktopNotif)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        imggenDesktopNotif ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        imggenDesktopNotif ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        Sound Notification
                        <FieldHelp slug="settings-notification-sound" tip="Sound when generation completes" />
                      </p>
                      <p className="text-xs text-muted-foreground">Play a sound when generation completes</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={imggenSoundNotif}
                      aria-label="Sound Notification"
                      onClick={() => setImggenSoundNotif(!imggenSoundNotif)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        imggenSoundNotif ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        imggenSoundNotif ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                  </div>

                  {imggenSoundNotif && (
                    <div className="space-y-2 pl-4">
                      <label htmlFor="imggenNotifSound" className="text-sm font-medium">
                        Notification Sound
                      </label>
                      <select
                        id="imggenNotifSound"
                        value={imggenNotifSound}
                        onChange={(e) => setImggenNotifSound(e.target.value)}
                        className="flex h-9 w-full rounded-input border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="default">Default</option>
                        <option value="chime">Chime</option>
                        <option value="bell">Bell</option>
                        <option value="ding">Ding</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Storage</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="imggenAutoDelete" className="text-sm font-medium flex items-center gap-1.5">
                      Auto-delete after (days)
                      <FieldHelp slug="imagegen-auto-delete-days" tip="Auto-remove old images" />
                    </label>
                    <Input
                      id="imggenAutoDelete"
                      type="number"
                      min={0}
                      max={365}
                      value={imggenAutoDeleteDays}
                      onChange={(e) => setImggenAutoDeleteDays(e.target.value ? parseInt(e.target.value, 10) : "")}
                      placeholder="Never"
                    />
                    <p className="text-xs text-muted-foreground">Leave blank to keep forever.</p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="imggenMaxGen" className="text-sm font-medium flex items-center gap-1.5">
                      Max stored generations
                      <FieldHelp slug="imagegen-max-generations" tip="Limit retained generated images" />
                    </label>
                    <Input
                      id="imggenMaxGen"
                      type="number"
                      min={0}
                      max={10000}
                      value={imggenMaxGenerations}
                      onChange={(e) => setImggenMaxGenerations(e.target.value ? parseInt(e.target.value, 10) : "")}
                      placeholder="Unlimited"
                    />
                    <p className="text-xs text-muted-foreground">Leave blank for no limit.</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">ComfyUI Connection</h3>
                <div className="space-y-2">
                  <label htmlFor="comfyuiUrl" className="text-sm font-medium flex items-center gap-1.5">
                    ComfyUI Base URL
                    <FieldHelp slug="imagegen-comfyui-base-url" tip="Override ComfyUI endpoint" />
                  </label>
                  <Input
                    id="comfyuiUrl"
                    type="url"
                    value={comfyuiBaseUrl}
                    onChange={(e) => setComfyuiBaseUrl(e.target.value)}
                    placeholder="http://localhost:8188"
                  />
                  <p className="text-xs text-muted-foreground">
                    Override the default ComfyUI server URL. Leave blank to use server default.
                  </p>
                </div>
              </div>
            </div>

            {imggenMsg && <StatusMessage message={imggenMsg.text} type={imggenMsg.type} />}

            <Button onClick={handleImggenPreferencesSave} disabled={preferencesSaving}>
              {preferencesSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("saveImageGenPreferences")}
            </Button>
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources" className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Resource Management</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Configure GPU resource offloading, preemption, and VRAM management preferences.
              </p>
            </div>

            <OffloadPreferences
              preference={resourcePreference}
              preferenceLoading={resourcePreferenceLoading}
              onSave={async (pref, remember) => {
                if (!userId) {
                  console.error("Cannot save resource preference: userId is not available");
                  throw new Error("User session not available. Please log in again.");
                }
                await setResourcePreference(userId, pref, remember);
              }}
              onReset={async () => {
                if (!userId) {
                  console.error("Cannot reset resource preference: userId is not available");
                  throw new Error("User session not available. Please log in again.");
                }
                await setResourcePreference(userId, "ask_each_time", true);
              }}
            />
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-6 pt-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Appearance</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Choose how the interface looks, or sync with your system settings.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">Select your preferred theme</p>
              </div>
              <ThemeToggle />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
    </TooltipProvider>
  );
}
