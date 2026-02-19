"use client";

import { Input, Badge } from "@workstation/ui";
import { Trash2 } from "lucide-react";
import type { BuilderNode } from "./use-ui-builder-state";
import { FieldHelp } from "@/components/help/field-help";

interface PropertiesEditorProps {
  node: BuilderNode;
  propsSchema: Record<string, unknown>;
  onUpdate: (props: Record<string, unknown>) => void;
  onRemove: () => void;
}

interface PropDef {
  type: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

function getPropertyHelp(def: PropDef, key: string): { slug: string; tip: string } {
  if (def.enum) {
    return {
      slug: "tool-parameter-select",
      tip: `Choose one predefined option for ${key}.`,
    };
  }
  if (def.type === "boolean") {
    return {
      slug: "tool-parameter-boolean",
      tip: `Enable or disable the ${key} option.`,
    };
  }
  if (def.type === "number") {
    return {
      slug: "tool-parameter-number",
      tip: `Numeric value used for ${key}.`,
    };
  }
  return {
    slug: "tool-parameter-text",
    tip: `Text value used for ${key}.`,
  };
}

export function PropertiesEditor({ node, propsSchema, onUpdate, onRemove }: PropertiesEditorProps) {
  const properties = (propsSchema as { properties?: Record<string, PropDef> })?.properties || {};

  const handleChange = (key: string, value: unknown) => {
    onUpdate({ [key]: value });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-2">
        <div>
          <h4 className="text-xs font-semibold">{node.componentName}</h4>
          <p className="text-[10px] text-muted-foreground">Edit properties</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-destructive transition-colors hover:bg-destructive/10"
          aria-label="Remove component"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-2">
        {Object.entries(properties).map(([key, def]) => {
          const help = getPropertyHelp(def, key);
          return (
            <div key={key} className="space-y-1">
              <label className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {key}
                <FieldHelp slug={help.slug} tip={help.tip} />
              </label>
              {renderPropInput(key, def, node.props[key], handleChange)}
            </div>
          );
        })}

        {Object.keys(properties).length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No configurable properties.
          </p>
        )}
      </div>
    </div>
  );
}

function renderPropInput(
  key: string,
  def: PropDef,
  value: unknown,
  onChange: (key: string, value: unknown) => void,
) {
  // Enum → select dropdown
  if (def.enum) {
    return (
      <select
        value={String(value ?? def.default ?? "")}
        onChange={(e) => onChange(key, e.target.value)}
        className="min-h-[32px] w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
      >
        {def.enum.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  // Boolean → toggle
  if (def.type === "boolean") {
    const checked = Boolean(value ?? def.default ?? false);
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(key, e.target.checked)}
          className="rounded border-input"
        />
        <span className="text-xs">{checked ? "Yes" : "No"}</span>
      </label>
    );
  }

  // Number → number input
  if (def.type === "number") {
    return (
      <Input
        type="number"
        value={String(value ?? def.default ?? 0)}
        onChange={(e) => {
          const num = Number(e.target.value);
          onChange(key, Number.isNaN(num) ? (def.default ?? 0) : num);
        }}
        min={def.minimum}
        max={def.maximum}
        className="h-7 text-xs"
      />
    );
  }

  // Color → color picker
  if (key.toLowerCase().includes("color")) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={String(value ?? def.default ?? "#000000")}
          onChange={(e) => onChange(key, e.target.value)}
          className="h-7 w-7 cursor-pointer rounded"
        />
        <Input
          value={String(value ?? def.default ?? "")}
          onChange={(e) => onChange(key, e.target.value)}
          className="h-7 flex-1 text-xs"
        />
      </div>
    );
  }

  // Array → tag badges (simplified)
  if (def.type === "array") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1">
          {arr.map((item, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              {typeof item === "object" ? JSON.stringify(item) : String(item)}
            </Badge>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {arr.length} item{arr.length !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }

  // Default → text input
  return (
    <Input
      value={String(value ?? def.default ?? "")}
      onChange={(e) => onChange(key, e.target.value)}
      className="h-7 text-xs"
    />
  );
}
