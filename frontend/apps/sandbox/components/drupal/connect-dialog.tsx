"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
} from "@workstation/ui";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import type { DrupalConnectRequest } from "@workstation/api/types";

interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (data: DrupalConnectRequest) => Promise<void>;
  connecting: boolean;
}

export function ConnectDialog({
  open,
  onOpenChange,
  onConnect,
  connecting,
}: ConnectDialogProps) {
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [siteName, setSiteName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);

      if (!siteUrl.trim() || !apiKey.trim()) {
        setError("Site URL and API key are required");
        return;
      }

      try {
        await onConnect({
          site_url: siteUrl.trim(),
          api_key: apiKey.trim(),
          site_name: siteName.trim() || undefined,
        });
        setSuccess(true);
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          onOpenChange(false);
          setSiteUrl("");
          setApiKey("");
          setSiteName("");
          setSuccess(false);
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    },
    [siteUrl, apiKey, siteName, onConnect, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Drupal Site</DialogTitle>
          <DialogDescription>
            Connect a remote Drupal site for config sync and Drush access.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="site-url" className="text-sm font-medium">Site URL</label>
            <Input
              id="site-url"
              placeholder="https://example.com"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              disabled={connecting}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="api-key" className="text-sm font-medium">API Key</label>
            <Input
              id="api-key"
              type="password"
              placeholder="Enter API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={connecting}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="site-name" className="text-sm font-medium">Site Name (optional)</label>
            <Input
              id="site-name"
              placeholder="My Drupal Site"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              disabled={connecting}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-sm text-green-500">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>Connected successfully!</span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={connecting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={connecting}>
              {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
