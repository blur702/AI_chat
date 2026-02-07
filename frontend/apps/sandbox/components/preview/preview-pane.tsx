"use client";

import { useState } from "react";
import { Button, Input } from "@workstation/ui";
import { RefreshCw, ExternalLink, Globe } from "lucide-react";

function isSafeUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function PreviewPane() {
  const [url, setUrl] = useState("http://localhost:3000");
  const [key, setKey] = useState(0);

  const handleOpenExternal = () => {
    if (isSafeUrl(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* URL bar */}
      <div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
        <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-6 border-0 bg-background/50 px-2 py-0 text-xs"
          onKeyDown={(e) => e.key === "Enter" && setKey((k) => k + 1)}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setKey((k) => k + 1)}
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleOpenExternal}
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>

      {/* Preview content */}
      <div className="flex-1 bg-white">
        <iframe
          key={key}
          src={url}
          className="h-full w-full border-0"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onError={() => {
            // Iframe load errors are handled by the browser
          }}
        />
      </div>
    </div>
  );
}
