"use client";

import { useState } from "react";
import { Button, Badge, cn } from "@workstation/ui";
import {
  Smartphone,
  Tablet,
  Monitor,
  RotateCw,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

interface ResponsiveTesterProps {
  html: string;
}

type Orientation = "portrait" | "landscape";

const VIEWPORTS = [
  { id: "mobile", label: "Mobile", width: 375, height: 667, icon: Smartphone },
  { id: "tablet", label: "Tablet", width: 768, height: 1024, icon: Tablet },
  { id: "desktop", label: "Desktop", width: 1280, height: 800, icon: Monitor },
] as const;

export function ResponsiveTester({ html }: ResponsiveTesterProps) {
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [tapTargetWarnings, setTapTargetWarnings] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);

  const toggleOrientation = () => {
    setOrientation((prev) => (prev === "portrait" ? "landscape" : "portrait"));
  };

  const validateTapTargets = () => {
    const warnings: string[] = [];

    // Parse the HTML and check for elements that might be too small
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const interactiveElements = doc.querySelectorAll(
      "a, button, input, select, textarea, [role='button'], [onclick]"
    );

    interactiveElements.forEach((el) => {
      const style = el.getAttribute("style") || "";
      const className = el.getAttribute("class") || "";
      const tag = el.tagName.toLowerCase();

      // Check for explicit small dimensions in inline styles
      const heightMatch = style.match(/height:\s*(\d+)px/);
      const minHeightMatch = style.match(/min-height:\s*(\d+)px/);

      if (heightMatch) {
        const h = parseInt(heightMatch[1], 10);
        if (h < 44) {
          warnings.push(
            `<${tag}> has height ${h}px (minimum 44px for touch targets)`
          );
        }
      }

      // Check for min-h-[Xpx] Tailwind classes below 44px
      const minHClass = className.match(/min-h-\[(\d+)px\]/);
      if (minHClass) {
        const h = parseInt(minHClass[1], 10);
        if (h < 44) {
          warnings.push(
            `<${tag}> has min-height ${h}px via Tailwind (minimum 44px for touch targets)`
          );
        }
      }

      // Check if height-related utility is completely absent on buttons/links
      if (
        (tag === "button" || tag === "a") &&
        !className.includes("min-h-") &&
        !className.includes("h-") &&
        !className.includes("py-") &&
        !className.includes("p-") &&
        !minHeightMatch
      ) {
        warnings.push(
          `<${tag}> "${(el.textContent || "").slice(0, 30)}" has no explicit height/padding — may be too small on mobile`
        );
      }
    });

    setTapTargetWarnings(warnings);
    setValidated(true);
  };

  const srcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <script src="https://cdn.tailwindcss.com"><\/script>
        <style>body { margin: 0; font-family: system-ui, sans-serif; }</style>
      </head>
      <body>${html}</body>
    </html>
  `;

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={toggleOrientation}
        >
          <RotateCw className="h-3 w-3" />
          {orientation === "portrait" ? "Portrait" : "Landscape"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={validateTapTargets}
        >
          {validated && tapTargetWarnings.length === 0 ? (
            <CheckCircle className="h-3 w-3 text-green-500" />
          ) : validated ? (
            <AlertTriangle className="h-3 w-3 text-yellow-500" />
          ) : null}
          Validate Tap Targets
        </Button>
      </div>

      {/* Tap target warnings */}
      {validated && tapTargetWarnings.length > 0 && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2 space-y-1">
          <p className="text-[10px] font-medium text-yellow-800">
            {tapTargetWarnings.length} tap target issue{tapTargetWarnings.length !== 1 ? "s" : ""}:
          </p>
          {tapTargetWarnings.map((w, i) => (
            <p key={i} className="text-[10px] text-yellow-700">
              {w}
            </p>
          ))}
        </div>
      )}
      {validated && tapTargetWarnings.length === 0 && (
        <div className="rounded-md border border-green-200 bg-green-50 p-2">
          <p className="text-[10px] text-green-700">
            All interactive elements meet minimum 44px touch target guidelines.
          </p>
        </div>
      )}

      {/* Side-by-side viewports */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {VIEWPORTS.map(({ id, label, width, height, icon: Icon }) => {
          const w = orientation === "portrait" ? width : height;
          const h = orientation === "portrait" ? height : width;
          // Scale down to fit in the panel
          const scale = Math.min(1, 280 / w);

          return (
            <div key={id} className="shrink-0 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Icon className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-medium">{label}</span>
                <Badge variant="outline" className="text-[8px]">
                  {w}x{h}
                </Badge>
              </div>
              <div
                className="rounded border bg-white overflow-hidden"
                style={{
                  width: w * scale,
                  height: h * scale * 0.5, // Show top half to save space
                }}
              >
                <iframe
                  srcDoc={srcDoc}
                  title={`${label} preview`}
                  className="border-0 origin-top-left"
                  style={{
                    width: w,
                    height: h,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
