"use client";

import { useState, useEffect } from "react";
import { Button, Input, Badge, cn } from "@workstation/ui";
import {
  AlertCircle,
  Check,
  HardDrive,
  Loader2,
  RotateCcw,
  Settings2,
} from "lucide-react";
import type { OffloadPreference } from "@workstation/api/types";

interface OffloadPreferencesProps {
  preference: OffloadPreference;
  preferenceLoading: boolean;
  onSave: (pref: OffloadPreference, remember: boolean) => Promise<void>;
  onReset: () => Promise<void>;
}

const PREFERENCE_OPTIONS: {
  value: OffloadPreference;
  label: string;
  description: string;
}[] = [
  {
    value: "ask_each_time",
    label: "Ask each time",
    description:
      "Prompt for confirmation before offloading or preempting resources. Recommended for most users.",
  },
  {
    value: "always_offload",
    label: "Always offload",
    description:
      "Automatically offload resources to CPU when VRAM is needed. Keeps models available but with slower inference.",
  },
  {
    value: "always_cancel",
    label: "Always cancel",
    description:
      "Never offload automatically. Operations requiring VRAM will be cancelled if insufficient memory is available.",
  },
];

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  id: string;
}

function ToggleSwitch({ checked, onChange, label, id }: ToggleSwitchProps) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

export function OffloadPreferences({
  preference,
  preferenceLoading,
  onSave,
  onReset,
}: OffloadPreferencesProps) {
  const [selectedPref, setSelectedPref] = useState<OffloadPreference>(preference);
  const [remember, setRemember] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Advanced settings — local state only, persistence coming in a future release.
  // These values are NOT included in the onSave payload.
  const [autoUnloadIdle, setAutoUnloadIdle] = useState(false);
  const [idleTimeoutMin, setIdleTimeoutMin] = useState(30);
  const [vramThreshold, setVramThreshold] = useState(90);
  const [preemptionStrategy, setPreemptionStrategy] = useState<"lru" | "priority" | "vram">("lru");

  useEffect(() => {
    setSelectedPref(preference);
  }, [preference]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(selectedPref, remember);
      setMessage({ text: "Offload preference saved successfully", type: "success" });
    } catch {
      setMessage({ text: "Failed to save preference", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onReset();
      setSelectedPref("ask_each_time");
      setRemember(true);
      setAutoUnloadIdle(false);
      setIdleTimeoutMin(30);
      setVramThreshold(90);
      setPreemptionStrategy("lru");
      setMessage({ text: "Preferences reset to defaults", type: "success" });
    } catch {
      setMessage({ text: "Failed to reset preferences", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Offload Behavior */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Offload Behavior</h3>
          <Badge variant="outline" className="text-[10px] capitalize">
            {preference.replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Choose how GPU resources are handled when VRAM runs low.
        </p>

        <div className="space-y-3">
          {PREFERENCE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                selectedPref === opt.value
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              )}
            >
              <input
                type="radio"
                name="offloadPreference"
                value={opt.value}
                checked={selectedPref === opt.value}
                onChange={() => setSelectedPref(opt.value)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {opt.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Remember Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Remember permanently</p>
          <p className="text-xs text-muted-foreground">
            If disabled, preference expires after 1 hour (session-scoped).
          </p>
        </div>
        <ToggleSwitch
          id="remember-preference"
          checked={remember}
          onChange={setRemember}
          label="Remember permanently"
        />
      </div>

      {/* Advanced Settings */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Advanced Settings</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Auto-unload idle resources</p>
              <p className="text-xs text-muted-foreground">
                Automatically offload resources that have not been used recently.
              </p>
            </div>
            <ToggleSwitch
              id="auto-unload-idle"
              checked={autoUnloadIdle}
              onChange={setAutoUnloadIdle}
              label="Auto-unload idle resources"
            />
          </div>

          {autoUnloadIdle && (
            <div className="space-y-2 pl-4">
              <label htmlFor="idleTimeout" className="text-sm font-medium">
                Idle timeout (minutes)
              </label>
              <Input
                id="idleTimeout"
                type="number"
                min={5}
                max={1440}
                value={idleTimeoutMin}
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val)) val = 30;
                  val = Math.max(5, Math.min(1440, val));
                  setIdleTimeoutMin(val);
                }}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Resources unused for this duration will be offloaded to CPU.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="vramThreshold" className="text-sm font-medium">
              VRAM warning threshold: {vramThreshold}%
            </label>
            <input
              id="vramThreshold"
              type="range"
              min={50}
              max={99}
              step={1}
              value={vramThreshold}
              onChange={(e) => setVramThreshold(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50%</span>
              <span>99%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Show warnings when VRAM utilization exceeds this threshold.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="preemptionStrategy" className="text-sm font-medium">
              Preemption strategy
            </label>
            <select
              id="preemptionStrategy"
              value={preemptionStrategy}
              onChange={(e) =>
                setPreemptionStrategy(
                  e.target.value as "lru" | "priority" | "vram"
                )
              }
              className="flex h-11 w-full rounded-input border border-input bg-background px-3 py-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="lru">Least Recently Used (LRU)</option>
              <option value="priority">Lowest Priority First</option>
              <option value="vram">Largest VRAM First</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Determines which resources are preempted first when VRAM needs to
              be freed.
            </p>
          </div>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={cn(
            "flex items-center gap-2 text-sm rounded-md px-3 py-2",
            message.type === "success"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-destructive/10 text-destructive"
          )}
          role="alert"
        >
          {message.type === "success" ? (
            <Check className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving || preferenceLoading}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Save Resource Preferences
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={saving || preferenceLoading}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
