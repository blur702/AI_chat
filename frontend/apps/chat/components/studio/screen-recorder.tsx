"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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

  // Clean up timer, stream, and recorder on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

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
        const file = new File([blob], `recording-${Date.now()}.webm`, { type: "video/webm" });

        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch(`/api/studio/projects/${projectId}/recordings`, {
            method: "POST",
            credentials: "include",
            body: formData,
          });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-lg bg-card p-6 shadow-xl">
        <h3 className="mb-4 font-semibold">Screen Recording</h3>

        {state === "idle" && (
          <div className="space-y-4 text-center">
            <Monitor className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Choose a screen or window to record</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={startRecording}>
                <Monitor className="mr-2 h-4 w-4" />
                Start Recording
              </Button>
            </div>
          </div>
        )}

        {state === "recording" && (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="font-mono text-lg">{formatDuration(duration)}</span>
            </div>
            <p className="text-sm text-muted-foreground">Recording in progress...</p>
            <Button variant="destructive" onClick={stopRecording}>
              <Square className="mr-2 h-4 w-4" />
              Stop Recording
            </Button>
          </div>
        )}

        {state === "uploading" && (
          <div className="space-y-4 text-center">
            <Upload className="mx-auto h-12 w-12 animate-pulse text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Uploading recording...</p>
          </div>
        )}
      </div>
    </div>
  );
}
