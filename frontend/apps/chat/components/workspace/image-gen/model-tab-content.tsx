"use client";

import { Input } from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";
import { LoraStack } from "./lora-stack";
import type { LoraConfig, ImageModelInfo } from "@workstation/api/types";

interface ModelTabContentProps {
  modelName: string;
  onModelChange: (value: string) => void;
  models: string[];
  modelDetails?: ImageModelInfo[];
  optionsLoading: boolean;
  samplerName: string;
  onSamplerChange: (value: string) => void;
  samplerOptions: string[];
  scheduler: string;
  onSchedulerChange: (value: string) => void;
  schedulerOptions: string[];
  loras: LoraConfig[];
  loraOptions: string[];
  loraError?: string;
  onLoraAdd: () => void;
  onLoraUpdate: (index: number, next: Partial<LoraConfig>) => void;
  onLoraRemove: (index: number) => void;
}

export function ModelTabContent({
  modelName,
  onModelChange,
  models,
  modelDetails,
  optionsLoading,
  samplerName,
  onSamplerChange,
  samplerOptions,
  scheduler,
  onSchedulerChange,
  schedulerOptions,
  loras,
  loraOptions,
  loraError,
  onLoraAdd,
  onLoraUpdate,
  onLoraRemove,
}: ModelTabContentProps) {
  return (
    <div className="space-y-4">
      {/* Model */}
      <div>
        <label htmlFor="model-select" className="text-xs font-medium flex items-center gap-1">
          Model <FieldHelp slug="imagegen-model" tip="Checkpoint model used for generation" />
        </label>
        {models.length > 0 ? (
          <select
            id="model-select"
            value={modelName}
            onChange={(e) => onModelChange(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {models.map((model) => {
              const detail = modelDetails?.find((d) => d.filename === model);
              const typeLabel = detail ? (detail.model_type === "sdxl" ? " [SDXL]" : " [SD 1.5]") : "";
              return (
                <option key={model} value={model}>{model}{typeLabel}</option>
              );
            })}
          </select>
        ) : (
          <Input
            value={modelName}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder={optionsLoading ? "Loading models..." : "Enter model checkpoint name"}
            className="mt-1"
          />
        )}
      </div>

      {/* Sampler + Scheduler */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="sampler-select" className="text-xs font-medium flex items-center gap-1">
            Sampler <FieldHelp slug="imagegen-sampler" tip="Sampling algorithm (euler, dpmpp_2m, etc.)" />
          </label>
          <select
            id="sampler-select"
            value={samplerName}
            onChange={(e) => onSamplerChange(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {samplerOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="scheduler-select" className="text-xs font-medium flex items-center gap-1">
            Scheduler <FieldHelp slug="imagegen-scheduler" tip="Noise schedule (normal, karras, exponential)" />
          </label>
          <select
            id="scheduler-select"
            value={scheduler}
            onChange={(e) => onSchedulerChange(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {schedulerOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* LoRA Stack */}
      <LoraStack
        loras={loras}
        loraOptions={loraOptions}
        error={loraError}
        onAdd={onLoraAdd}
        onUpdate={onLoraUpdate}
        onRemove={onLoraRemove}
      />
    </div>
  );
}
