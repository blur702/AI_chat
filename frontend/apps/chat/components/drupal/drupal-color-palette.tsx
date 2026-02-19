"use client";

import { useState, useCallback } from "react";
import { Button, Input, cn } from "@workstation/ui";
import type {
  PaletteResponse,
  PaletteGenerateRequest,
  PaletteColor,
  ContrastPair,
} from "@workstation/api/types";
import {
  Paintbrush,
  Copy,
  Check,
  RefreshCw,
  Wand2,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { FieldHelp } from "@/components/help/field-help";

interface Props {
  palette: PaletteResponse | null;
  loading: boolean;
  onGenerate: (data: PaletteGenerateRequest) => Promise<PaletteResponse>;
  onValidate: (colors: string[]) => Promise<PaletteResponse>;
  onAdjust: (colors: string[]) => Promise<PaletteResponse>;
}

const HARMONIES = [
  { value: "complementary", label: "Complementary" },
  { value: "triadic", label: "Triadic" },
  { value: "analogous", label: "Analogous" },
  { value: "split-complementary", label: "Split-Complementary" },
  { value: "tetradic", label: "Tetradic" },
] as const;

export function DrupalColorPalette({ palette, loading, onGenerate, onValidate, onAdjust }: Props) {
  const [description, setDescription] = useState("");
  const [seedColor, setSeedColor] = useState("#3b82f6");
  const [harmony, setHarmony] = useState<"complementary" | "triadic" | "analogous" | "split-complementary" | "tetradic">("complementary");
  const [count, setCount] = useState(6);
  const [copied, setCopied] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    try {
      setError(null);
      await onGenerate({
        description: description || undefined,
        seed_color: seedColor || undefined,
        harmony,
        count,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate palette");
    }
  }, [description, seedColor, harmony, count, onGenerate]);

  const handleValidate = useCallback(async () => {
    if (!palette?.colors.length) return;
    try {
      setError(null);
      await onValidate(palette.colors.map((c) => c.hex));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to validate palette");
    }
  }, [palette, onValidate]);

  const handleAdjust = useCallback(async () => {
    if (!palette?.colors.length) return;
    try {
      setError(null);
      await onAdjust(palette.colors.map((c) => c.hex));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to adjust palette");
    }
  }, [palette, onAdjust]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API may be unavailable (e.g. non-secure context)
    }
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <Paintbrush className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="font-semibold text-sm">Color Palette Generator</h2>
        <span className="text-xs text-muted-foreground ml-auto">WCAG AA</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {/* Generation Form */}
        <section aria-labelledby="palette-gen-heading">
          <h3 id="palette-gen-heading" className="text-sm font-medium mb-3">Generate Palette</h3>

          <div className="space-y-3">
            {/* AI Description */}
            <div>
              <label htmlFor="palette-desc" className="text-xs text-muted-foreground mb-1 inline-flex items-center gap-1.5">
                Describe your palette (AI-powered)
                <FieldHelp
                  slug="palette-description"
                  tip="Describe tone, style, or brand mood to guide AI palette generation."
                />
              </label>
              <Input
                id="palette-desc"
                placeholder='e.g. "Modern ocean sunset theme"'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Seed color + harmony row */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="seed-color" className="text-xs text-muted-foreground mb-1 inline-flex items-center gap-1.5">
                  Seed Color
                  <FieldHelp
                    slug="palette-seed-color"
                    tip="Starting color that anchors generated palette variations."
                  />
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="seed-color"
                    value={seedColor}
                    onChange={(e) => setSeedColor(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                    aria-label="Pick seed color"
                  />
                  <Input
                    value={seedColor}
                    onChange={(e) => setSeedColor(e.target.value)}
                    className="text-sm font-mono flex-1"
                    maxLength={7}
                    aria-label="Seed color hex value"
                  />
                </div>
              </div>

              <div className="flex-1">
                <label htmlFor="harmony-select" className="text-xs text-muted-foreground mb-1 inline-flex items-center gap-1.5">
                  Harmony
                  <FieldHelp
                    slug="palette-harmony"
                    tip="Color relationship rule used to generate balanced combinations."
                  />
                </label>
                <select
                  id="harmony-select"
                  value={harmony}
                  onChange={(e) => setHarmony(e.target.value as typeof harmony)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {HARMONIES.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Count */}
            <div>
              <label htmlFor="color-count" className="text-xs text-muted-foreground mb-1 inline-flex items-center gap-1.5">
                Number of colors: {count}
                <FieldHelp
                  slug="palette-colors"
                  tip="Set how many swatches to include in the generated palette."
                />
              </label>
              <input
                type="range"
                id="color-count"
                min={3}
                max={12}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label={`Number of colors: ${count}`}
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              {loading ? "Generating..." : "Generate Palette"}
            </Button>
          </div>
        </section>

        {/* Palette Display */}
        {palette && (
          <>
            <section aria-labelledby="palette-colors-heading">
              <div className="flex items-center justify-between mb-3">
                <h3 id="palette-colors-heading" className="text-sm font-medium">Palette</h3>
                <div className="flex items-center gap-1">
                  {palette.all_aa_pass ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      All AA Pass
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      Some fail AA
                    </span>
                  )}
                </div>
              </div>

              {/* Color swatches */}
              <div className="grid grid-cols-3 gap-2" role="list" aria-label="Palette colors">
                {palette.colors.map((color, i) => (
                  <ColorSwatch
                    key={i}
                    color={color}
                    copied={copied === color.hex}
                    onCopy={() => copyToClipboard(color.hex, color.hex)}
                  />
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={handleValidate} disabled={loading} className="flex-1">
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  Validate
                </Button>
                <Button variant="outline" size="sm" onClick={handleAdjust} disabled={loading} className="flex-1">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  Auto-fix AA
                </Button>
              </div>
            </section>

            {/* Contrast Matrix */}
            <section>
              <button
                onClick={() => setShowMatrix(!showMatrix)}
                className="flex items-center gap-1 text-sm font-medium w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                aria-expanded={showMatrix}
              >
                {showMatrix ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Contrast Matrix
              </button>
              {showMatrix && palette.contrast_matrix.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="text-xs w-full border-collapse" aria-label="WCAG AA contrast results">
                    <thead>
                      <tr>
                        <th className="text-left p-1 border-b font-medium">FG</th>
                        <th className="text-left p-1 border-b font-medium">BG</th>
                        <th className="text-right p-1 border-b font-medium">Ratio</th>
                        <th className="text-center p-1 border-b font-medium">AA</th>
                        <th className="text-center p-1 border-b font-medium">AA Large</th>
                      </tr>
                    </thead>
                    <tbody>
                      {palette.contrast_matrix.map((pair, i) => (
                        <ContrastRow key={i} pair={pair} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Export */}
            <section>
              <button
                onClick={() => setShowExport(!showExport)}
                className="flex items-center gap-1 text-sm font-medium w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                aria-expanded={showExport}
              >
                {showExport ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Export
              </button>
              {showExport && (
                <div className="mt-2 space-y-3">
                  {palette.css_variables && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">CSS Variables</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(palette.css_variables, "css")}
                          className="h-6 px-2"
                        >
                          {copied === "css" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto font-mono whitespace-pre-wrap">
                        {palette.css_variables}
                      </pre>
                    </div>
                  )}
                  {palette.scss_variables && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">SCSS Variables</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(palette.scss_variables, "scss")}
                          className="h-6 px-2"
                        >
                          {copied === "scss" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto font-mono whitespace-pre-wrap">
                        {palette.scss_variables}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/** Single color swatch card */
function ColorSwatch({
  color,
  copied,
  onCopy,
}: {
  color: PaletteColor;
  copied: boolean;
  onCopy: () => void;
}) {
  // Choose white or black text based on luminance
  const textColor = isLight(color.hex) ? "#000000" : "#ffffff";

  return (
    <div
      role="listitem"
      className="rounded-lg border overflow-hidden focus-within:ring-2 focus-within:ring-ring"
    >
      <button
        onClick={onCopy}
        className="w-full h-16 flex items-end p-2 transition-opacity hover:opacity-90 focus-visible:outline-none"
        style={{ backgroundColor: color.hex, color: textColor }}
        aria-label={`Copy ${color.hex} — ${color.name || color.role}`}
      >
        <span className="text-[10px] font-mono font-bold opacity-90">
          {copied ? "Copied!" : color.hex}
        </span>
      </button>
      <div className="px-2 py-1.5 bg-background">
        <div className="text-xs font-medium truncate">{color.name || color.hex}</div>
        {color.role && (
          <div className="text-[10px] text-muted-foreground capitalize">{color.role}</div>
        )}
      </div>
    </div>
  );
}

/** Contrast matrix row */
function ContrastRow({ pair }: { pair: ContrastPair }) {
  return (
    <tr className="border-b border-muted/50">
      <td className="p-1">
        <span className="inline-flex items-center gap-1">
          <span
            className="w-3 h-3 rounded-sm border inline-block"
            style={{ backgroundColor: pair.fg }}
            aria-hidden="true"
          />
          <span className="font-mono">{pair.fg}</span>
        </span>
      </td>
      <td className="p-1">
        <span className="inline-flex items-center gap-1">
          <span
            className="w-3 h-3 rounded-sm border inline-block"
            style={{ backgroundColor: pair.bg }}
            aria-hidden="true"
          />
          <span className="font-mono">{pair.bg}</span>
        </span>
      </td>
      <td className="text-right p-1 font-mono">{pair.ratio.toFixed(2)}</td>
      <td className="text-center p-1">
        <PassBadge pass={pair.aa_normal} label="AA normal text" />
      </td>
      <td className="text-center p-1">
        <PassBadge pass={pair.aa_large} label="AA large text" />
      </td>
    </tr>
  );
}

function PassBadge({ pass, label }: { pass: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-block w-5 text-center text-[10px] font-bold rounded",
        pass ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      )}
      aria-label={`${label}: ${pass ? "pass" : "fail"}`}
    >
      {pass ? "P" : "F"}
    </span>
  );
}

/** Simple luminance check — returns true if color is light */
function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5;
}
