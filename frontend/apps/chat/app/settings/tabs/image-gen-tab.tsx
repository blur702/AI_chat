"use client";

import { useState, useEffect } from "react";
import { Input, LoadingButton, SettingsToggle, StatusMessage } from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";
import type { UserPreferences } from "@workstation/api/types";

interface ImageGenTabProps {
  preferences: UserPreferences | null;
  updatePreferences: (data: Partial<UserPreferences>) => Promise<{ success: boolean; error?: string }>;
  preferencesSaving: boolean;
}

export function ImageGenTab({ preferences, updatePreferences, preferencesSaving }: ImageGenTabProps) {
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
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (preferences) {
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

  const handleSave = async () => {
    setMsg(null);
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
      setMsg({ text: "Image generation preferences saved", type: "success" });
    } else {
      setMsg({ text: result.error ?? "Failed to save preferences", type: "error" });
    }
  };

  return (
    <div className="space-y-6 pt-6">
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
            <FieldHelp slug="imagegen-workflow" tip="Choose how inputs are processed. For example, text-to-image for new concepts, image-to-image to restyle a photo, or inpainting to fix just the background." />
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
              <FieldHelp slug="imagegen-width" tip="Horizontal resolution in pixels. For example, 512 for SD 1.5 iteration, 1024 for SDXL. Doubling width roughly quadruples VRAM usage and render time." />
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
              <FieldHelp slug="imagegen-height" tip="Vertical resolution in pixels. For example, 768x512 for landscape banners, 512x768 for mobile stories. Match target platform ratios early to minimize reframing." />
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
              <FieldHelp slug="imagegen-steps" tip="More steps refine detail but with diminishing returns. For example, euler works well at 20-30 steps, dpmpp_2m at 15-25. Use 20 for iteration, 30-40 for finals." />
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
              <FieldHelp slug="imagegen-cfg-scale" tip="Prompt adherence strength. For example, CFG 7 is a solid default for photorealism, CFG 4-5 for looser stylized art. Values above 15 can cause artifacts." />
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
          <label htmlFor="imggenPrompt" className="text-sm font-medium">Default Prompt</label>
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
            <FieldHelp slug="imagegen-system-prompt" tip="Prepended to every image prompt globally. For example, 'cinematic lighting, film grain, 8k detail' ensures all generations share a consistent visual baseline." />
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
            <FieldHelp slug="imagegen-negative-prompt" tip="What the model should avoid. For example, 'blurry, watermark, deformed hands, extra fingers' suppresses common artifacts. Keep a reusable baseline." />
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
            <SettingsToggle
              label="Completion Notification"
              description="Notify when generation completes"
              checked={imggenCompletionNotif}
              onCheckedChange={setImggenCompletionNotif}
              className="p-3"
            >
              <FieldHelp slug="imagegen-completion-notif" tip="In-app toast alert when generation finishes. For example, a batch of 8 images at 40 steps may take minutes — this lets you work elsewhere meanwhile." />
            </SettingsToggle>

            <SettingsToggle
              label="Desktop Notification"
              description="Show browser desktop notification"
              checked={imggenDesktopNotif}
              onCheckedChange={setImggenDesktopNotif}
              className="p-3"
            >
              <FieldHelp slug="imagegen-desktop-notif" tip="Native OS popup even when the browser tab is minimized. For example, you will see a system notification while working in your code editor during a long render." />
            </SettingsToggle>

            <SettingsToggle
              label="Sound Notification"
              description="Play a sound when generation completes"
              checked={imggenSoundNotif}
              onCheckedChange={setImggenSoundNotif}
              className="p-3"
            >
              <FieldHelp slug="settings-notification-sound" tip="Plays an audio cue when generation completes. For example, the 'chime' sound is subtle for frequent use while 'bell' is louder for infrequent batches." />
            </SettingsToggle>

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
                <FieldHelp slug="imagegen-auto-delete-days" tip="Permanently removes images older than this many days. For example, 7 keeps only the past week. Star or export your best results before the cleanup window." />
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
                <FieldHelp slug="imagegen-max-generations" tip="Oldest images are removed when this cap is reached. For example, setting 500 keeps your most recent 500 outputs. Combine with auto-delete for two-layer cleanup." />
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
              <FieldHelp slug="imagegen-comfyui-base-url" tip="Override for custom ComfyUI endpoints. For example, 'http://192.168.1.50:8188' to use a remote GPU server. Leave blank for the Docker default." />
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

      {msg && <StatusMessage message={msg.text} type={msg.type} />}

      <LoadingButton onClick={handleSave} loading={preferencesSaving}>
        Save Image Generation Preferences
      </LoadingButton>
    </div>
  );
}
