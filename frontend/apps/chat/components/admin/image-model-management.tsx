"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Skeleton } from "@workstation/ui";
import { Download, HardDrive, Layers, RefreshCcw, Cpu } from "lucide-react";
import { getClient } from "@workstation/api";
import type {
  ImageGenerationOptionsResponse,
  ImageModelInfo,
  LoraInfo,
} from "@workstation/api/types";

export function ImageModelManagement() {
  const [options, setOptions] = useState<ImageGenerationOptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClient().getImageGenerationOptions();
      setOptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch image generation options");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const typeBadge = (type: string) => {
    if (type === "sdxl")
      return (
        <Badge
          variant="outline"
          className="border-purple-300 bg-purple-500/10 px-1.5 py-0 text-[10px] text-purple-600"
        >
          SDXL
        </Badge>
      );
    if (type === "sd15")
      return (
        <Badge
          variant="outline"
          className="border-blue-300 bg-blue-500/10 px-1.5 py-0 text-[10px] text-blue-600"
        >
          SD 1.5
        </Badge>
      );
    return (
      <Badge
        variant="outline"
        className="border-green-300 bg-green-500/10 px-1.5 py-0 text-[10px] text-green-600"
      >
        Both
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={fetchOptions}>
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const modelDetails = options?.model_details ?? [];
  const loraDetails = options?.lora_details ?? [];
  const upscaleModels = options?.upscale_models ?? [];
  const controlnetTypes = options?.controlnet_types ?? [];
  const samplers = options?.samplers ?? [];
  const schedulers = options?.schedulers ?? [];

  const sd15Models = modelDetails.filter((m) => m.model_type === "sd15");
  const sdxlModels = modelDetails.filter((m) => m.model_type === "sdxl");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Image Generation Models</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Models discovered from ComfyUI. To add more models, run{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
              bash scripts/download_models.sh
            </code>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOptions}>
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Checkpoints */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Checkpoints ({modelDetails.length})
          </h3>
        </div>

        {modelDetails.length === 0 ? (
          <p className="pl-6 text-xs text-muted-foreground">
            No checkpoints found. Download models first.
          </p>
        ) : (
          <div className="grid gap-2">
            {sd15Models.length > 0 && (
              <div className="space-y-1.5">
                <p className="pl-6 text-[11px] font-medium text-blue-600">SD 1.5 Models</p>
                {sd15Models.map((m) => (
                  <ModelRow key={m.filename} model={m} typeBadge={typeBadge} />
                ))}
              </div>
            )}
            {sdxlModels.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="pl-6 text-[11px] font-medium text-purple-600">SDXL Models</p>
                {sdxlModels.map((m) => (
                  <ModelRow key={m.filename} model={m} typeBadge={typeBadge} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* LoRAs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            LoRAs ({loraDetails.length})
          </h3>
        </div>

        {loraDetails.length === 0 ? (
          <p className="pl-6 text-xs text-muted-foreground">No LoRAs found.</p>
        ) : (
          <div className="space-y-1.5">
            {loraDetails.map((l) => (
              <div
                key={l.filename}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs"
              >
                <span className="flex-1 truncate font-mono">{l.filename}</span>
                {typeBadge(l.model_type)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upscale Models */}
      {upscaleModels.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Upscale Models ({upscaleModels.length})
            </h3>
          </div>
          <div className="space-y-1.5">
            {upscaleModels.map((name) => (
              <div key={name} className="truncate rounded-md border px-3 py-2 font-mono text-xs">
                {name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold">Summary</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          <div className="rounded bg-muted/50 p-2 text-center">
            <p className="text-lg font-bold">{modelDetails.length}</p>
            <p className="text-muted-foreground">Checkpoints</p>
          </div>
          <div className="rounded bg-muted/50 p-2 text-center">
            <p className="text-lg font-bold">{loraDetails.length}</p>
            <p className="text-muted-foreground">LoRAs</p>
          </div>
          <div className="rounded bg-muted/50 p-2 text-center">
            <p className="text-lg font-bold">{upscaleModels.length}</p>
            <p className="text-muted-foreground">Upscalers</p>
          </div>
          <div className="rounded bg-muted/50 p-2 text-center">
            <p className="text-lg font-bold">{samplers.length}</p>
            <p className="text-muted-foreground">Samplers</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelRow({
  model,
  typeBadge,
}: {
  model: ImageModelInfo;
  typeBadge: (type: string) => React.ReactNode;
}) {
  return (
    <div className="ml-6 flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
      <span className="flex-1 truncate font-mono">{model.filename}</span>
      {typeBadge(model.model_type)}
    </div>
  );
}
