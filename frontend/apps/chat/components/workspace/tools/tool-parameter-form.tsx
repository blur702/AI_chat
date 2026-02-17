"use client";

import { Input } from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";

interface ParameterSchema {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
}

interface ToolParameterFormProps {
  schema: Record<string, unknown>;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  prefill?: Record<string, string>;
}

export function ToolParameterForm({
  schema,
  values,
  onChange,
  prefill,
}: ToolParameterFormProps) {
  const properties = (schema.properties ?? {}) as Record<
    string,
    ParameterSchema
  >;
  const required = (schema.required ?? []) as string[];

  const handleChange = (key: string, value: unknown) => {
    onChange({ ...values, [key]: value });
  };

  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">
        This tool has no parameters.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, param]) => {
        const isRequired = required.includes(key);
        const currentValue =
          values[key] ?? prefill?.[key] ?? param.default ?? "";
        const helpTip = param.description ?? `Configure ${key} parameter.`;

        if (param.type === "boolean") {
          return (
            <div key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`param-${key}`}
                checked={Boolean(currentValue)}
                onChange={(e) => handleChange(key, e.target.checked)}
                className="h-4 w-4 rounded border"
              />
              <label htmlFor={`param-${key}`} className="text-xs font-medium flex items-center gap-1">
                {key}
                {isRequired && <span className="text-destructive ml-0.5">*</span>}
                <FieldHelp tip={helpTip} />
              </label>
              {param.description && (
                <span className="text-[10px] text-muted-foreground">
                  {param.description}
                </span>
              )}
            </div>
          );
        }

        if (param.enum) {
          return (
            <div key={key}>
              <label className="text-xs font-medium mb-1 flex items-center gap-1">
                {key}
                {isRequired && <span className="text-destructive ml-0.5">*</span>}
                <FieldHelp tip={helpTip} />
              </label>
              <select
                value={String(currentValue)}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Select...</option>
                {param.enum.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              {param.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {param.description}
                </p>
              )}
            </div>
          );
        }

        if (param.type === "number" || param.type === "integer") {
          return (
            <div key={key}>
              <label className="text-xs font-medium mb-1 flex items-center gap-1">
                {key}
                {isRequired && <span className="text-destructive ml-0.5">*</span>}
                <FieldHelp tip={helpTip} />
              </label>
              <Input
                type="number"
                value={currentValue === "" ? "" : Number(currentValue)}
                onChange={(e) =>
                  handleChange(
                    key,
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="h-8 text-sm"
              />
              {param.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {param.description}
                </p>
              )}
            </div>
          );
        }

        // Default: string input
        return (
          <div key={key}>
            <label className="text-xs font-medium mb-1 flex items-center gap-1">
              {key}
              {isRequired && <span className="text-destructive ml-0.5">*</span>}
              <FieldHelp tip={helpTip} />
            </label>
            <Input
              type="text"
              value={String(currentValue)}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={param.description ?? `Enter ${key}`}
              className="h-8 text-sm"
            />
            {param.description && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {param.description}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
