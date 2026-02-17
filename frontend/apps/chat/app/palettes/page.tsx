"use client";

import { useMemo, useState } from "react";
import { Button, Input } from "@workstation/ui";
import { usePalettes } from "@workstation/api/hooks";
import type { SavedPaletteColor } from "@workstation/api/types";
import { FieldHelp } from "@/components/help/field-help";

function normalizeHex(value: string): string {
  const v = value.trim();
  if (!v) return "#000000";
  const hexOnly = v.startsWith("#") ? v.slice(1) : v;
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hexOnly)) {
    return "#000000";
  }
  if (hexOnly.length === 3) {
    return ("#" + hexOnly.split("").map((ch) => ch + ch).join("")).toLowerCase();
  }
  return `#${hexOnly.toLowerCase()}`;
}

function toCssVariables(colors: SavedPaletteColor[]): string {
  return [
    ":root {",
    ...colors.map((c, i) => {
      const role = (c.role || c.name || `color-${i + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-");
      return `  --${role}: ${normalizeHex(c.hex)};`;
    }),
    "}",
  ].join("\n");
}

export default function PalettesPage() {
  const { palettes, loading, error, createPalette, updatePalette, deletePalette } = usePalettes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [colors, setColors] = useState<SavedPaletteColor[]>([
    { hex: "#0f172a", role: "text" },
    { hex: "#f8fafc", role: "background" },
    { hex: "#2563eb", role: "primary" },
  ]);
  const [msg, setMsg] = useState<string | null>(null);

  const selected = useMemo(
    () => palettes.find((p) => p.id === selectedId) ?? null,
    [palettes, selectedId]
  );

  const loadPalette = (id: string) => {
    const p = palettes.find((x) => x.id === id);
    if (!p) return;
    setSelectedId(p.id);
    setName(p.name);
    setDescription(p.description ?? "");
    setTags((p.tags || []).join(", "));
    setColors((p.colors || []).map((c) => ({ ...c, hex: normalizeHex(c.hex) })));
    setMsg(null);
  };

  const clearEditor = () => {
    setSelectedId(null);
    setName("");
    setDescription("");
    setTags("");
    setColors([
      { hex: "#0f172a", role: "text" },
      { hex: "#f8fafc", role: "background" },
      { hex: "#2563eb", role: "primary" },
    ]);
    setMsg(null);
  };

  const savePalette = async () => {
    if (!name.trim() || colors.length === 0) {
      setMsg("Name and at least one color are required.");
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      colors: colors.map((c) => ({
        hex: normalizeHex(c.hex),
        name: c.name?.trim() || undefined,
        role: c.role?.trim() || undefined,
      })),
    };
    try {
      if (selectedId) {
        const updated = await updatePalette(selectedId, payload);
        setMsg(updated ? "Palette updated." : "Failed to update palette.");
      } else {
        const created = await createPalette(payload);
        if (created) {
          setSelectedId(created.id);
          setMsg("Palette created.");
        } else {
          setMsg("Failed to create palette.");
        }
      }
    } catch {
      setMsg("Failed to save palette.");
    }
  };

  const removePalette = async () => {
    if (!selectedId) return;
    const ok = await deletePalette(selectedId);
    if (ok) {
      clearEditor();
      setMsg("Palette deleted.");
    } else {
      setMsg("Failed to delete palette.");
    }
  };

  const copyCss = async () => {
    try {
      await navigator.clipboard.writeText(toCssVariables(colors));
      setMsg("Copied CSS variables.");
    } catch {
      setMsg("Failed to copy to clipboard.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Palette Library</h1>
        <p className="text-sm text-muted-foreground">
          Save palettes once and reuse them anywhere in your workflow.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="rounded-md border p-3 space-y-2 h-fit">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Saved Palettes</h2>
            <Button variant="outline" size="sm" onClick={clearEditor}>New</Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading palettes...</p>
          ) : palettes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No palettes yet.</p>
          ) : (
            <div className="space-y-2">
              {palettes.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => loadPalette(p.id)}
                  className={`w-full text-left rounded-md border p-2 ${selectedId === p.id ? "border-primary bg-primary/5" : "hover:bg-accent/50"}`}
                >
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.colors.slice(0, 6).map((c, i) => (
                      <span key={`${p.id}-${i}`} className="h-4 w-4 rounded border" style={{ backgroundColor: c.hex }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="rounded-md border p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium flex items-center gap-1.5">
                Palette Name
                <FieldHelp slug="palette-name" tip="Descriptive name for this palette" />
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ocean Night" />
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-1.5">
                Tags
                <FieldHelp slug="palette-tags" tip="Comma-separated labels for searching and grouping" />
              </label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="brand, dark, marketing" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium flex items-center gap-1.5">
              Description
              <FieldHelp slug="palette-description" tip="Optional notes about intent and usage" />
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Where to use this palette, contrast notes, brand guidance..."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-1.5">
                Colors
                <FieldHelp slug="palette-colors" tip="Define each color hex and optional role/name" />
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setColors((prev) => [...prev, { hex: "#000000" }])}
              >
                Add Color
              </Button>
            </div>
            <div className="space-y-2">
              {colors.map((c, i) => (
                <div key={`color-${i}`} className="grid grid-cols-[56px_1fr_1fr_40px] gap-2">
                  <input
                    type="color"
                    value={normalizeHex(c.hex)}
                    onChange={(e) => {
                      const next = [...colors];
                      next[i] = { ...next[i], hex: e.target.value };
                      setColors(next);
                    }}
                    className="h-9 w-14 rounded border"
                  />
                  <Input
                    value={c.hex}
                    onChange={(e) => {
                      const next = [...colors];
                      next[i] = { ...next[i], hex: e.target.value };
                      setColors(next);
                    }}
                    placeholder="#2563eb"
                  />
                  <Input
                    value={c.role ?? ""}
                    onChange={(e) => {
                      const next = [...colors];
                      next[i] = { ...next[i], role: e.target.value };
                      setColors(next);
                    }}
                    placeholder="role (primary, accent...)"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setColors((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={colors.length <= 1}
                  >
                    X
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-sm font-medium mb-2">Preview</div>
            <div className="flex flex-wrap gap-2">
              {colors.map((c, i) => (
                <div key={`preview-${i}`} className="w-24 rounded border overflow-hidden">
                  <div className="h-8" style={{ backgroundColor: normalizeHex(c.hex) }} />
                  <div className="px-2 py-1 text-[11px]">{normalizeHex(c.hex)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={savePalette}>{selected ? "Save Changes" : "Create Palette"}</Button>
            <Button variant="outline" onClick={copyCss}>Copy CSS Vars</Button>
            {selected && (
              <Button variant="destructive" onClick={removePalette}>Delete</Button>
            )}
          </div>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
