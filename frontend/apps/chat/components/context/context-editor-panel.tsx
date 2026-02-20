"use client";

import { useState, useEffect } from "react";
import { getClient } from "@workstation/api";
import { ContextEditor } from "./context-editor";
import { Loader2 } from "lucide-react";

interface ContextEditorPanelProps {
  projectId: string;
  onClose: () => void;
}

export function ContextEditorPanel({ projectId, onClose }: ContextEditorPanelProps) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveChatId() {
      setLoading(true);
      setError(null);
      setChatId(null);

      // Always fetch from API to avoid stale localStorage
      try {
        const response = await getClient().getProjectChats(projectId);
        if (!cancelled) {
          if (response.chats && response.chats.length > 0) {
            setChatId(response.chats[0].id);
          } else {
            setError("No chats found for this project.");
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to resolve chat");
          setLoading(false);
        }
      }
    }

    resolveChatId();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !chatId) {
    return (
      <div className="flex items-center justify-center h-full p-4 text-center">
        <p className="text-sm text-muted-foreground">
          {error ?? "No active chat found for this project."}
        </p>
      </div>
    );
  }

  return <ContextEditor chatId={chatId} onClose={onClose} />;
}
