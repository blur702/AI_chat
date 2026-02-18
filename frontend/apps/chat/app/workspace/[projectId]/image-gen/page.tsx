"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getClient } from "@workstation/api";
import {
  useAuth,
  useImageGeneration,
  useProject,
  useServiceStatus,
  useSettings,
} from "@workstation/api/hooks";
import type { ImageGenerationOptionsResponse, UserPreferences } from "@workstation/api/types";
import { Button } from "@workstation/ui";
import { ArrowLeft, Layers } from "lucide-react";
import Link from "next/link";
import { GenerationForm } from "@/components/workspace/image-gen/generation-form";
import { ImageGallery } from "@/components/workspace/image-gen/image-gallery";
import { ContextEditorFullscreen } from "@/components/context/context-editor-fullscreen";

export default function ImageGenerationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { userId } = useAuth();
  const imageHook = useImageGeneration(projectId);
  const { project, updateProject } = useProject(projectId);
  const { services, refresh: refreshServiceStatus } = useServiceStatus();
  const { preferences, preferencesLoading, updatePreferences } = useSettings(userId);
  const [showContext, setShowContext] = useState(false);
  const [startingComfyUI, setStartingComfyUI] = useState(false);
  const [comfyuiStartupMessage, setComfyuiStartupMessage] = useState<string | null>(null);
  const [comfyuiStartupError, setComfyuiStartupError] = useState<string | null>(null);
  const [comfyuiStartupSeconds, setComfyuiStartupSeconds] = useState(0);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [imageOptions, setImageOptions] = useState<ImageGenerationOptionsResponse | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);

  // Fetch chatId from API instead of stale localStorage
  useEffect(() => {
    let cancelled = false;
    async function fetchChatId() {
      try {
        const response = await getClient().getProjectChats(projectId);
        if (!cancelled && response.chats?.length > 0) {
          setChatId(response.chats[0].id);
        }
      } catch {
        // Silently ignore — context button just won't show
      }
    }
    fetchChatId();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const comfyuiService = services.find((s) => s.name === "comfyui_client");
  const comfyuiAvailable = comfyuiService?.detail?.healthy;
  const comfyuiHealthMessage = comfyuiService?.detail?.message ?? null;

  const handleSaveAsDefault = useCallback(
    async (defaults: Partial<UserPreferences>) => {
      await updatePreferences(defaults);
    },
    [updatePreferences],
  );

  const projectImageSystemContext = useMemo(
    () => String((project?.settings?.imggen_system_prompt as string | undefined) ?? ""),
    [project?.settings],
  );

  const handleSaveProjectImageContext = useCallback(
    async (value: string) => {
      const nextSettings: Record<string, unknown> = {
        ...(project?.settings ?? {}),
      };
      if (value.trim()) {
        nextSettings.imggen_system_prompt = value.trim();
      } else {
        delete nextSettings.imggen_system_prompt;
      }
      return updateProject({
        settings: nextSettings,
      });
    },
    [project?.settings, updateProject],
  );

  const loadGenerationOptions = useCallback(async () => {
    if (!comfyuiAvailable) {
      setImageOptions(null);
      return;
    }
    setOptionsLoading(true);
    try {
      const options = await getClient().getImageGenerationOptions();
      setImageOptions(options);
    } catch {
      setImageOptions(null);
    } finally {
      setOptionsLoading(false);
    }
  }, [comfyuiAvailable]);

  const startComfyUI = useCallback(async () => {
    if (startingComfyUI) return;
    setComfyuiStartupError(null);
    setComfyuiStartupSeconds(0);
    setStartingComfyUI(true);
    setComfyuiStartupMessage("Starting ComfyUI container...");

    try {
      const result = await getClient().startComfyUI();
      setComfyuiStartupMessage(result.message);
      await refreshServiceStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start ComfyUI";
      setComfyuiStartupError(message);
      setStartingComfyUI(false);
    }
  }, [refreshServiceStatus, startingComfyUI]);

  useEffect(() => {
    if (!startingComfyUI) return;
    const intervalId = setInterval(() => {
      setComfyuiStartupSeconds((seconds) => seconds + 2);
      refreshServiceStatus();
    }, 2000);
    return () => clearInterval(intervalId);
  }, [refreshServiceStatus, startingComfyUI]);

  useEffect(() => {
    if (!startingComfyUI) return;
    if (comfyuiAvailable) {
      setStartingComfyUI(false);
      setComfyuiStartupMessage("ComfyUI is ready.");
      setComfyuiStartupError(null);
      return;
    }
    if (comfyuiHealthMessage) {
      setComfyuiStartupMessage(comfyuiHealthMessage);
    }
  }, [comfyuiAvailable, comfyuiHealthMessage, startingComfyUI]);

  useEffect(() => {
    void loadGenerationOptions();
  }, [loadGenerationOptions]);

  const comfyuiStatusMessage = useMemo(() => {
    if (comfyuiStartupError) return comfyuiStartupError;
    if (startingComfyUI && comfyuiStartupMessage) return comfyuiStartupMessage;
    if (!comfyuiAvailable && comfyuiHealthMessage) return comfyuiHealthMessage;
    return null;
  }, [
    comfyuiAvailable,
    comfyuiHealthMessage,
    comfyuiStartupError,
    comfyuiStartupMessage,
    startingComfyUI,
  ]);

  if (!userId || preferencesLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link href={`/workspace/${projectId}`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Workspace
          </Button>
        </Link>
      </div>
      <div className="flex h-full flex-col gap-4 md:flex-row">
        <div className="w-full overflow-auto md:w-[380px] md:shrink-0">
          <GenerationForm
            projectId={projectId}
            hookState={imageHook}
            userPreferences={preferences}
            projectSystemContext={projectImageSystemContext}
            onSaveProjectSystemContext={handleSaveProjectImageContext}
            onSaveAsDefault={handleSaveAsDefault}
            comfyuiAvailable={comfyuiAvailable}
            comfyuiStarting={startingComfyUI}
            comfyuiStatusMessage={comfyuiStatusMessage}
            comfyuiStartupSeconds={comfyuiStartupSeconds}
            onStartComfyui={startComfyUI}
            imageOptions={imageOptions}
            optionsLoading={optionsLoading}
          />
          {chatId && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => setShowContext(true)}
              >
                <Layers className="h-3.5 w-3.5" />
                Context Editor
              </Button>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 overflow-auto rounded-md border p-4">
          <ImageGallery projectId={projectId} hookState={imageHook} />
        </div>
      </div>

      {chatId && (
        <ContextEditorFullscreen chatId={chatId} open={showContext} onOpenChange={setShowContext} />
      )}
    </div>
  );
}
