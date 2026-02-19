"use client";

import { Button, Input } from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";

interface SettingsTabContentProps {
  width: number;
  onWidthChange: (value: number) => void;
  height: number;
  onHeightChange: (value: number) => void;
  steps: number;
  onStepsChange: (value: number) => void;
  cfgScale: number;
  onCfgScaleChange: (value: number) => void;
  batchSize: number;
  onBatchSizeChange: (value: number) => void;
  seed: string;
  onSeedChange: (value: string) => void;
  errors: Record<string, string>;
}

export function SettingsTabContent({
  width,
  onWidthChange,
  height,
  onHeightChange,
  steps,
  onStepsChange,
  cfgScale,
  onCfgScaleChange,
  batchSize,
  onBatchSizeChange,
  seed,
  onSeedChange,
  errors,
}: SettingsTabContentProps) {
  const fieldError = (key: string) =>
    errors[key] ? <p className="text-[11px] text-destructive mt-1">{errors[key]}</p> : null;

  return (
    <div className="space-y-4">
      {/* Size presets + width/height */}
      <div className="space-y-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Presets:</span>
          {[512, 768, 1024].map((size) => (
            <Button
              key={size}
              type="button"
              variant={width === size && height === size ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => { onWidthChange(size); onHeightChange(size); }}
            >
              {size}x{size}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium flex items-center gap-1">
              Width <FieldHelp slug="imagegen-width" tip="Sets the horizontal resolution of the generated image in pixels. Larger values produce more detail but require more VRAM and significantly longer generation time." />
            </label>
            <Input
              type="number"
              min={64}
              max={2048}
              value={width}
              onChange={(e) => onWidthChange(Number(e.target.value || 0))}
              className="mt-1"
            />
            {fieldError("width")}
          </div>
          <div>
            <label className="text-xs font-medium flex items-center gap-1">
              Height <FieldHelp slug="imagegen-height" tip="Sets the vertical resolution of the generated image in pixels. Pair with Width to control the aspect ratio — e.g. 512x768 for portrait, 768x512 for landscape." />
            </label>
            <Input
              type="number"
              min={64}
              max={2048}
              value={height}
              onChange={(e) => onHeightChange(Number(e.target.value || 0))}
              className="mt-1"
            />
            {fieldError("height")}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div>
        <label className="text-xs font-medium flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            Steps <FieldHelp slug="imagegen-steps" tip="Controls how many denoising iterations the model runs. 20-30 steps is a good balance; values above 50 rarely improve quality but always increase generation time." />
          </span>
          <span>{steps}</span>
        </label>
        <input
          type="range"
          min={1}
          max={150}
          value={steps}
          onChange={(e) => onStepsChange(Number(e.target.value))}
          className="mt-2 w-full"
        />
        {fieldError("steps")}
      </div>

      {/* CFG Scale */}
      <div>
        <label className="text-xs font-medium flex items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            CFG Scale <FieldHelp slug="imagegen-cfg-scale" tip="Classifier-Free Guidance scale. Higher values (7-12) make the model follow your prompt more strictly; lower values (1-5) allow more creative freedom. Values above 15 often cause over-saturation." />
          </span>
          <span>{cfgScale.toFixed(1)}</span>
        </label>
        <input
          type="range"
          min={1}
          max={30}
          step={0.5}
          value={cfgScale}
          onChange={(e) => onCfgScaleChange(Number(e.target.value))}
          className="mt-2 w-full"
        />
        {fieldError("cfg_scale")}
      </div>

      {/* Batch + Seed */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium flex items-center gap-1">
            Batch Size <FieldHelp slug="imagegen-batch-size" tip="Generates this many images in a single pass, useful for exploring variations. Each additional image multiplies VRAM usage and generation time proportionally." />
          </label>
          <Input
            type="number"
            min={1}
            max={8}
            value={batchSize}
            onChange={(e) => onBatchSizeChange(Number(e.target.value || 1))}
            className="mt-1"
          />
          {fieldError("batch_size")}
        </div>
        <div>
          <label className="text-xs font-medium flex items-center gap-1">
            Seed <FieldHelp slug="imagegen-seed" tip="A fixed seed produces identical images given the same prompt and settings, useful for iterating on a composition. Leave empty for a random seed each generation." />
          </label>
          <Input
            value={seed}
            onChange={(e) => onSeedChange(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Random if empty"
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}
