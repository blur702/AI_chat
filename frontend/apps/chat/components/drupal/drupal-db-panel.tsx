"use client";

import { useState } from "react";
import { Button, Input } from "@workstation/ui";
import { Database, RefreshCw, ExternalLink } from "lucide-react";

const DEFAULT_URL = "http://localhost:8082";

export function DrupalDbPanel() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [iframeSrc, setIframeSrc] = useState(DEFAULT_URL);
  const [key, setKey] = useState(0);

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Database Management (phpMyAdmin)">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Database className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-7 text-xs font-mono flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") { setIframeSrc(url); setKey((k) => k + 1); }
          }}
          aria-label="phpMyAdmin URL"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => { setIframeSrc(url); setKey((k) => k + 1); }}
          title="Refresh"
          aria-label="Refresh phpMyAdmin"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => window.open(iframeSrc, "_blank", "noopener,noreferrer")}
          title="Open in new tab"
          aria-label="Open phpMyAdmin in new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* iframe */}
      <div className="flex-1 relative">
        <iframe
          key={key}
          src={iframeSrc}
          className="absolute inset-0 w-full h-full border-0"
          title="phpMyAdmin"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
