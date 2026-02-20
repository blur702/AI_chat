"use client";

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button, Input, cn } from "@workstation/ui";
import {
  RefreshCw,
  ExternalLink,
  Globe,
  Smartphone,
  Tablet,
  Monitor,
  MousePointer,
  Eye,
} from "lucide-react";
import { PREVIEW_INJECTION_SCRIPT } from "./preview-injection-source";

type ViewportSize = "mobile" | "tablet" | "desktop" | "auto";
type PreviewMode = "view" | "edit";

const VIEWPORTS: Record<Exclude<ViewportSize, "auto">, { width: number; label: string }> = {
  mobile: { width: 375, label: "Mobile (375px)" },
  tablet: { width: 768, label: "Tablet (768px)" },
  desktop: { width: 1280, label: "Desktop (1280px)" },
};

function isSafeUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export interface PreviewPaneHandle {
  postBuilderUpdate: (action: string, html?: string) => void;
}

export const PreviewPane = forwardRef<PreviewPaneHandle, { defaultUrl?: string }>(function PreviewPane({ defaultUrl }, ref) {
  const [url, setUrl] = useState(defaultUrl || "http://localhost:3000");
  const [key, setKey] = useState(0);
  const [viewport, setViewport] = useState<ViewportSize>("auto");
  const [mode, setMode] = useState<PreviewMode>("view");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const safePreviewUrl = isSafeUrl(url) ? url : "about:blank";
  const getTargetOrigin = useCallback((): string | null => {
    if (!url || !isSafeUrl(url)) return null;
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }, [url]);

  const handleOpenExternal = () => {
    if (isSafeUrl(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  // Listen for messages from injected script in edit mode
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Validate origin matches the preview iframe URL
      try {
        if (url && e.origin !== new URL(url).origin) return;
      } catch {
        return;
      }
      if (e.data?.type === "element-selected" && mode === "edit") {
        setSelectedPath(e.data.path || null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [mode, url]);

  // Track whether the injection script has been loaded into the iframe
  const injectedRef = useRef(false);

  // Inject edit-mode script into iframe
  const injectEditMode = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    // Try to inject the script into same-origin iframes
    if (!injectedRef.current && isSafeUrl(url)) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          const script = iframeDoc.createElement("script");
          script.textContent = PREVIEW_INJECTION_SCRIPT;
          script.setAttribute("data-preview-injection", "true");
          iframeDoc.body.appendChild(script);
          injectedRef.current = true;
        }
      } catch {
        // Cross-origin — fall through to postMessage only
      }
    }

    try {
      const targetOrigin = getTargetOrigin();
      if (!targetOrigin) return;
      iframe.contentWindow.postMessage(
        { type: "enable-edit-mode" },
        targetOrigin
      );
    } catch {
      // Cross-origin — can't communicate
    }
  }, [getTargetOrigin, url]);

  const disableEditMode = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    try {
      const targetOrigin = getTargetOrigin();
      if (!targetOrigin) return;
      iframe.contentWindow.postMessage(
        { type: "disable-edit-mode" },
        targetOrigin
      );
    } catch {
      // Cross-origin
    }
    setSelectedPath(null);
  }, [getTargetOrigin, url]);

  const handleModeToggle = useCallback(() => {
    if (mode === "view") {
      setMode("edit");
      injectEditMode();
    } else {
      setMode("view");
      disableEditMode();
    }
  }, [mode, injectEditMode, disableEditMode]);

  // Send builder updates to the iframe (exposed via ref)
  const postBuilderUpdate = useCallback((action: string, html?: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    try {
      const targetOrigin = getTargetOrigin();
      if (!targetOrigin) return;
      iframe.contentWindow.postMessage(
        { type: "builder-update", action, html },
        targetOrigin
      );
    } catch {
      // Cross-origin
    }
  }, [getTargetOrigin]);

  useImperativeHandle(ref, () => ({ postBuilderUpdate }), [postBuilderUpdate]);

  // Listen for builder-update messages from other components in the parent window
  useEffect(() => {
    const handleBuilderMessage = (e: MessageEvent) => {
      if (e.data?.type === "builder-update" && e.source === window) {
        postBuilderUpdate(e.data.action, e.data.html);
      }
    };
    window.addEventListener("message", handleBuilderMessage);
    return () => window.removeEventListener("message", handleBuilderMessage);
  }, [postBuilderUpdate]);

  const iframeStyle: React.CSSProperties =
    viewport === "auto"
      ? { width: "100%", height: "100%" }
      : {
          width: VIEWPORTS[viewport].width,
          maxWidth: "100%",
          height: "100%",
        };

  return (
    <div className="flex h-full flex-col">
      {/* URL bar + controls */}
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
          aria-label="Refresh preview"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleOpenExternal}
          aria-label="Open in new tab"
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>

      {/* Viewport + mode controls */}
      <div className="flex items-center gap-1 border-b bg-muted/20 px-2 py-1">
        {/* Viewport toggles */}
        <div className="flex items-center gap-0.5 mr-2">
          <Button
            variant={viewport === "auto" ? "secondary" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onClick={() => setViewport("auto")}
            aria-label="Auto width"
          >
            <Monitor className="h-3 w-3" />
          </Button>
          <Button
            variant={viewport === "mobile" ? "secondary" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onClick={() => setViewport("mobile")}
            aria-label="Mobile viewport (375px)"
          >
            <Smartphone className="h-3 w-3" />
          </Button>
          <Button
            variant={viewport === "tablet" ? "secondary" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onClick={() => setViewport("tablet")}
            aria-label="Tablet viewport (768px)"
          >
            <Tablet className="h-3 w-3" />
          </Button>
          <Button
            variant={viewport === "desktop" ? "secondary" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onClick={() => setViewport("desktop")}
            aria-label="Desktop viewport (1280px)"
          >
            <Monitor className="h-3.5 w-3.5" />
          </Button>
        </div>

        {viewport !== "auto" && (
          <span className="text-[10px] text-muted-foreground mr-2">
            {VIEWPORTS[viewport].label}
          </span>
        )}

        <div className="flex-1" />

        {/* Mode toggle */}
        <Button
          variant={mode === "edit" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 text-[10px]"
          onClick={handleModeToggle}
        >
          {mode === "edit" ? (
            <>
              <MousePointer className="h-3 w-3" />
              Edit Mode
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              View Mode
            </>
          )}
        </Button>
      </div>

      {/* Selected element breadcrumb */}
      {mode === "edit" && selectedPath && (
        <div className="flex items-center gap-1 border-b bg-primary/5 px-2 py-1 overflow-x-auto">
          <span className="text-[10px] text-muted-foreground shrink-0">Selected:</span>
          <span className="text-[10px] font-mono text-primary truncate">
            {selectedPath}
          </span>
        </div>
      )}

      {/* Preview content */}
      <div
        ref={containerRef}
        className={cn(
          "flex-1 bg-white overflow-auto",
          viewport !== "auto" && "flex justify-center"
        )}
      >
        {!isSafeUrl(url) && (
          <div className="border-b bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            Unsafe URL blocked. Only HTTP(S) URLs are allowed in preview.
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={key}
          src={safePreviewUrl}
          className="border-0"
          style={iframeStyle}
          title="Preview"
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          onLoad={() => {
            injectedRef.current = false;
            if (mode === "edit") injectEditMode();
          }}
          onError={() => {
            // Iframe load errors are handled by the browser
          }}
        />
      </div>
    </div>
  );
});
