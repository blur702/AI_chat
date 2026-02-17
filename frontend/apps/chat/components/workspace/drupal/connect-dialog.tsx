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
import { FieldHelp } from "@/components/help/field-help";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [siteName, setSiteName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear form when dialog closes
  useEffect(() => {
    if (!open) {
      setSiteUrl("");
      setUsername("");
      setPassword("");
      setSiteName("");
      setError(null);
      setSuccess(false);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);

      if (!siteUrl.trim() || !username.trim() || !password.trim()) {
        setError("Site URL, username, and password are required");
        return;
      }

      try {
        await onConnect({
          site_url: siteUrl.trim(),
          username: username.trim(),
          password: password,
          site_name: siteName.trim() || undefined,
        });
        setSuccess(true);
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          onOpenChange(false);
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    },
    [siteUrl, username, password, siteName, onConnect, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Drupal Site</DialogTitle>
          <DialogDescription>
            Connect a remote Drupal site using JSON:API with Basic Auth.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="site-url" className="text-sm font-medium flex items-center gap-1">
              Site URL
              <FieldHelp
                slug="drupal-connect-site-url"
                tip="Base URL of the remote Drupal site you want to connect."
              />
            </label>
            <Input
              id="site-url"
              placeholder="https://example.com"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              disabled={connecting}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="drupal-username" className="text-sm font-medium flex items-center gap-1">
              Username
              <FieldHelp
                slug="drupal-connect-username"
                tip="Drupal admin username with JSON:API access."
              />
            </label>
            <Input
              id="drupal-username"
              autoComplete="username"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={connecting}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="drupal-password" className="text-sm font-medium flex items-center gap-1">
              Password
              <FieldHelp
                slug="drupal-connect-password"
                tip="Drupal account password for Basic Auth."
              />
            </label>
            <Input
              id="drupal-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={connecting}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="site-name" className="text-sm font-medium flex items-center gap-1">
              Site Name (optional)
              <FieldHelp
                slug="drupal-connect-site-name"
                tip="Friendly label used in the UI for this connected site."
              />
            </label>
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
