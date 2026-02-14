"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth, useImageGeneration, useServiceStatus, useSettings } from "@workstation/api/hooks";
import type { UserPreferences } from "@workstation/api/types";
import { GenerationForm } from "@/components/workspace/image-gen/generation-form";
import { ImageGallery } from "@/components/workspace/image-gen/image-gallery";

export default function ImageGenerationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { userId } = useAuth();
  const imageHook = useImageGeneration(projectId);
  const { services } = useServiceStatus();
  const { preferences, preferencesLoading, updatePreferences } = useSettings(userId);

  const comfyuiAvailable = services.find(
    (s) => s.name === "comfyui_client"
  )?.detail?.healthy;

  const handleSaveAsDefault = useCallback(
    async (defaults: Partial<UserPreferences>) => {
      await updatePreferences(defaults);
    },
    [updatePreferences]
  );

  if (!userId || preferencesLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex flex-col md:flex-row gap-4 h-full">
        <div className="w-full md:w-[380px] md:shrink-0 overflow-auto">
          <GenerationForm
            projectId={projectId}
            hookState={imageHook}
            userPreferences={preferences}
            onSaveAsDefault={handleSaveAsDefault}
            comfyuiAvailable={comfyuiAvailable}
          />
        </div>
        <div className="flex-1 min-w-0 overflow-auto rounded-md border p-4">
          <ImageGallery projectId={projectId} hookState={imageHook} />
        </div>
      </div>
    </div>
  );
}
