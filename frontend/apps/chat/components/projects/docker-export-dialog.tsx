"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
} from "@workstation/ui";
import { Download, FileText, Loader2, Check, AlertCircle } from "lucide-react";
import { getClient } from "@workstation/api/client";
import type { DockerExportResponse } from "@workstation/api/types";
import { FieldHelp } from "@/components/help/field-help";

interface DockerExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export function DockerExportDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: DockerExportDialogProps) {
  const [imageName, setImageName] = useState(
    projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-")
  );
  const [includeCompose, setIncludeCompose] = useState(true);
  const [includeTar, setIncludeTar] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<DockerExportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      const res = await getClient().exportAsDocker(projectId, {
        image_name: imageName.trim() || undefined,
        include_compose: includeCompose,
        include_tar: includeTar,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Docker export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTar = async () => {
    if (!result?.image_id) return;
    try {
      const blob = await getClient().downloadDockerTar(projectId, result.image_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${imageName || "project"}.tar`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setResult(null);
      setError(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export as Docker Image</DialogTitle>
          <DialogDescription>
            Create a portable Docker image from <strong>{projectName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label htmlFor="docker-image-name" className="text-sm font-medium flex items-center gap-1">
              Image Name
              <FieldHelp
                slug="docker-export-image-name"
                tip="Container image repository name used for the exported artifact."
              />
            </label>
            <Input
              id="docker-image-name"
              placeholder="my-project"
              value={imageName}
              onChange={(e) => setImageName(e.target.value)}
              disabled={exporting || !!result}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeCompose}
              onChange={(e) => setIncludeCompose(e.target.checked)}
              disabled={exporting || !!result}
              className="rounded border-input"
            />
            Generate docker-compose.yml
            <FieldHelp
              slug="docker-export-include-compose"
              tip="Include a compose file based on the exported container configuration."
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeTar}
              onChange={(e) => setIncludeTar(e.target.checked)}
              disabled={exporting || !!result}
              className="rounded border-input"
            />
            Create downloadable tar archive
            <FieldHelp
              slug="docker-export-include-tar"
              tip="Create a downloadable image tarball for transfer/import."
            />
          </label>

          {result && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">Export complete</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Image: {result.image_name} ({result.image_id.slice(0, 12)})
              </p>
              {result.compose_file && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" /> docker-compose.yml
                  </summary>
                  <pre className="mt-1 p-2 bg-muted rounded text-[10px] overflow-auto max-h-48">
                    {result.compose_file}
                  </pre>
                </details>
              )}
              {result.tar_download_url && (
                <Button size="sm" variant="outline" onClick={handleDownloadTar}>
                  <Download className="mr-1.5 h-3 w-3" />
                  Download .tar
                </Button>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                "Export"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
