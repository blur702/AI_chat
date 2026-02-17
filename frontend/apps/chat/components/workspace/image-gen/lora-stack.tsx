"use client";

import { Button, Input } from "@workstation/ui";
import { Plus, Trash2 } from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";
import type { LoraConfig } from "@workstation/api/types";

interface LoraStackProps {
  loras: LoraConfig[];
  loraOptions: string[];
  error?: string | null;
  onAdd: () => void;
  onUpdate: (index: number, next: Partial<LoraConfig>) => void;
  onRemove: (index: number) => void;
}

export function LoraStack({
  loras,
  loraOptions,
  error,
  onAdd,
  onUpdate,
  onRemove,
}: LoraStackProps) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium flex items-center gap-1">LoRA Stack <FieldHelp slug="imagegen-lora" tip="Add style/subject LoRA models" /></p>
        <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px]" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add LoRA
        </Button>
      </div>
      {loras.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No LoRAs selected.</p>
      )}
      {loras.map((lora, index) => (
        <div key={`${lora.name}-${index}`} className="grid grid-cols-[1fr_auto] gap-2 rounded border p-2">
          <div className="space-y-2">
            {loraOptions.length > 0 ? (
              <select
                value={lora.name}
                onChange={(event) => onUpdate(index, { name: event.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                aria-label={`LoRA ${index + 1} name`}
              >
                {loraOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : (
              <Input
                value={lora.name}
                onChange={(event) => onUpdate(index, { name: event.target.value })}
                placeholder="LoRA filename"
                className="h-8 text-xs"
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step={0.1}
                value={lora.strength_model}
                onChange={(event) => onUpdate(index, { strength_model: Number(event.target.value) })}
                className="h-8 text-xs"
                aria-label={`LoRA ${index + 1} model strength`}
              />
              <Input
                type="number"
                step={0.1}
                value={lora.strength_clip}
                onChange={(event) => onUpdate(index, { strength_clip: Number(event.target.value) })}
                className="h-8 text-xs"
                aria-label={`LoRA ${index + 1} clip strength`}
              />
            </div>
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => onRemove(index)} aria-label={`Remove LoRA ${index + 1}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </div>
  );
}
