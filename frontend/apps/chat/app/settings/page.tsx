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
} from "@workstation/ui";
import { useAuth, useSettings } from "@workstation/api/hooks";
import { ArrowLeft, Loader2, Check, AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

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
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [aiMsg, setAiMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

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
      setCustomSystemPrompt(preferences.custom_system_prompt ?? "");
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
      custom_system_prompt: customSystemPrompt || undefined,
    });
    if (result.success) {
      setAiMsg({ text: "AI preferences saved", type: "success" });
    } else {
      setAiMsg({ text: result.error ?? "Failed to save AI preferences", type: "error" });
    }
  };

  const isLoading = userLoading || preferencesLoading;

  return (
    <div className="flex min-h-screen flex-col p-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/chat">
          <Button variant="ghost" size="icon" aria-label="Back to chat">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="profile" className="w-full">
          <TabsList aria-label="Settings sections" className="w-full grid grid-cols-5">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
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
                  <label htmlFor="firstName" className="text-sm font-medium">
                    First Name
                  </label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="lastName" className="text-sm font-medium">
                    Last Name
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
                <label htmlFor="screenName" className="text-sm font-medium">
                  Display Name
                </label>
                <Input
                  id="screenName"
                  value={screenName}
                  onChange={(e) => setScreenName(e.target.value)}
                  placeholder="Display name"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
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
              Save Profile
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
                <label htmlFor="currentPassword" className="text-sm font-medium">
                  Current Password
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
              Change Password
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
                  <p className="text-sm font-medium">Email Notifications</p>
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
                  <p className="text-sm font-medium">In-App Notifications</p>
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
              Save Preferences
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
                <label htmlFor="defaultModel" className="text-sm font-medium">
                  Default Model
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
                <label htmlFor="temperature" className="text-sm font-medium">
                  Temperature: {defaultTemperature.toFixed(2)}
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
                <label htmlFor="systemPrompt" className="text-sm font-medium">
                  Custom System Prompt
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
              Save AI Preferences
            </Button>
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
  );
}
