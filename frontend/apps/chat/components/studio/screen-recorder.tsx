"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@workstation/ui";
import { Monitor, Square, Upload } from "lucide-react";

interface ScreenRecorderProps {
  projectId: string;
  onDone: (asset: any) => void;
  onCancel: () => void;
}

export function ScreenRecorder({ projectId, onDone, onCancel }: ScreenRecorderProps) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Clean up stream
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);

        // Upload recording
        setState("uploading");
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const file = new File(
          [blob],
          `recording-${Date.now()}.webm`,
          { type: "video/webm" }
        );

        const formData = new FormData();
        formData.append("file", file);

        try {
          const token = localStorage.getItem("auth_token");
          const res = await fetch(
            `/api/studio/projects/${projectId}/recordings`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            }
          );
          if (res.ok) {
            const asset = await res.json();
            onDone(asset);
          } else {
            onCancel();
          }
        } catch {
          onCancel();
        }
      };

      // User might stop sharing via browser UI
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      });

      recorder.start(1000); // collect every 1s
      setState("recording");

      // Timer
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch {
      // User cancelled screen picker
      onCancel();
    }
  }, [projectId, onDone, onCancel]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-card rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="font-semibold mb-4">Screen Recording</h3>

        {state === "idle" && (
          <div className="text-center space-y-4">
            <Monitor className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Choose a screen or window to record
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={startRecording}>
                <Monitor className="w-4 h-4 mr-2" />
                Start Recording
              </Button>
            </div>
          </div>
        )}

        {state === "recording" && (
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-lg font-mono">{formatDuration(duration)}</span>
            </div>
            <p className="text-sm text-muted-foreground">Recording in progress...</p>
            <Button variant="destructive" onClick={stopRecording}>
              <Square className="w-4 h-4 mr-2" />
              Stop Recording
            </Button>
          </div>
        )}

        {state === "uploading" && (
          <div className="text-center space-y-4">
            <Upload className="w-12 h-12 mx-auto text-muted-foreground animate-pulse" />
            <p className="text-sm text-muted-foreground">
              Uploading recording...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
