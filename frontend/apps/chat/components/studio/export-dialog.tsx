"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@workstation/ui";
import { Download, X, Loader2, CheckCircle, AlertCircle, FileVideo, Globe } from "lucide-react";

type ExportFormat = "mp4" | "html";

interface ExportDialogProps {
  projectId: string;
  onClose: () => void;
}

interface ExportStatus {
  id: string;
  status: string;
  format: string;
  progress_percent: number;
  error_message: string | null;
  file_size_bytes: number | null;
}

export function ExportDialog({ projectId, onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [status, setStatus] = useState<"idle" | "exporting" | "completed" | "failed">("idle");
  const [exportId, setExportId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const startExport = useCallback(async () => {
    setStatus("exporting");
    setProgress(0);
    setError(null);

    const token = localStorage.getItem("auth_token");
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/export`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ format }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to start export");
      }

      const data = await res.json();
      setExportId(data.id);
    } catch (err: any) {
      setStatus("failed");
      setError(err.message || "Export failed");
    }
  }, [projectId, format]);

  // Poll export status
  useEffect(() => {
    if (!exportId || status !== "exporting") return;

    const token = localStorage.getItem("auth_token");

    const poll = async () => {
      try {
        const res = await fetch(`/api/studio/exports/${exportId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data: ExportStatus = await res.json();
        setProgress(data.progress_percent);

        if (data.status === "completed") {
          setStatus("completed");
          setFileSize(data.file_size_bytes);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === "failed") {
          setStatus("failed");
          setError(data.error_message || "Export failed");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // ignore poll errors
      }
    };

    poll(); // immediate first check
    pollRef.current = setInterval(poll, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [exportId, status]);

  const handleDownload = useCallback(async () => {
    if (!exportId) return;
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const res = await fetch(`/api/studio/exports/${exportId}/download`, { headers });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${exportId}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Download failed silently
    }
  }, [exportId]);

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Export Video</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === "idle" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Format</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFormat("mp4")}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                    format === "mp4"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <FileVideo className="h-5 w-5 shrink-0" />
                  <div>
                    <div className="font-medium">MP4 Video</div>
                    <div className="text-[10px] text-muted-foreground">Standard video file</div>
                  </div>
                </button>
                <button
                  onClick={() => setFormat("html")}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                    format === "html"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Globe className="h-5 w-5 shrink-0" />
                  <div>
                    <div className="font-medium">Interactive HTML</div>
                    <div className="text-[10px] text-muted-foreground">
                      Clickable links & overlays
                    </div>
                  </div>
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {format === "mp4"
                ? "Renders all tracks to an MP4 video via FFmpeg."
                : "Creates a self-contained HTML page with video playback and clickable text/link overlays."}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={startExport}>
                <Download className="mr-2 h-4 w-4" />
                Start Export
              </Button>
            </div>
          </div>
        )}

        {status === "exporting" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Rendering video...</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">{progress}% complete</p>
          </div>
        )}

        {status === "completed" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Export complete!</span>
            </div>
            {fileSize && (
              <p className="text-xs text-muted-foreground">File size: {formatSize(fileSize)}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download {format === "html" ? "HTML" : "MP4"}
              </Button>
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Export failed</span>
            </div>
            {error && <p className="rounded bg-muted p-2 text-xs text-muted-foreground">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button variant="outline" onClick={startExport}>
                Retry
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
