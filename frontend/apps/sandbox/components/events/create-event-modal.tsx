"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Button,
  Input,
  Badge,
  ScrollArea,
} from "@workstation/ui";
import {
  Send,
  Save,
  Eye,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  ChevronDown,
} from "lucide-react";
import type { EventCreate, EventSeverity } from "@workstation/api/types";

const EVENT_TEMPLATES: Record<string, Omit<EventCreate, "source">> = {
  "Model Loaded": {
    event_type: "model_loaded",
    event_data: { model_name: "", vram_mb: 0 },
    severity: "info",
  },
  "Model Unloaded": {
    event_type: "model_unloaded",
    event_data: { model_name: "", reason: "manual" },
    severity: "info",
  },
  "System Alert": {
    event_type: "system",
    event_data: { message: "" },
    severity: "warning",
  },
  "Error Report": {
    event_type: "error",
    event_data: { message: "", stack: "" },
    severity: "error",
  },
  "User Action": {
    event_type: "user_action",
    event_data: { action: "", target: "" },
    severity: "info",
  },
  "Resource Updated": {
    event_type: "resource_updated",
    event_data: { resource_id: "", changes: {} },
    severity: "info",
  },
  Custom: {
    event_type: "",
    event_data: {},
    severity: "info",
  },
};

const SEVERITY_OPTIONS: { value: EventSeverity; label: string; color: string }[] = [
  { value: "info", label: "Info", color: "text-blue-500" },
  { value: "warning", label: "Warning", color: "text-yellow-500" },
  { value: "error", label: "Error", color: "text-red-500" },
  { value: "critical", label: "Critical", color: "text-red-700" },
];

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTypes: string[];
  onSubmit: (data: EventCreate) => Promise<void>;
  creating: boolean;
  error: string | null;
}

export function CreateEventModal({
  open,
  onOpenChange,
  eventTypes,
  onSubmit,
  creating,
  error,
}: CreateEventModalProps) {
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [eventType, setEventType] = useState("");
  const [eventDataJson, setEventDataJson] = useState("{}");
  const [severity, setSeverity] = useState<EventSeverity>("info");
  const [source, setSource] = useState("ui");
  const [persist, setPersist] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [success, setSuccess] = useState(false);
  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }
    };
  }, []);

  const filteredTypes = useMemo(() => {
    if (!eventType) return eventTypes;
    return eventTypes.filter((t) =>
      t.toLowerCase().includes(eventType.toLowerCase())
    );
  }, [eventTypes, eventType]);

  const validateJson = useCallback((value: string) => {
    try {
      JSON.parse(value);
      setJsonError(null);
      return true;
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      return false;
    }
  }, []);

  const handleTemplateSelect = useCallback((templateName: string) => {
    const template = EVENT_TEMPLATES[templateName];
    if (!template) return;
    setEventType(template.event_type);
    setEventDataJson(JSON.stringify(template.event_data, null, 2));
    setSeverity(template.severity ?? "info");
    setJsonError(null);
  }, []);

  const resetForm = useCallback(() => {
    setStep("edit");
    setEventType("");
    setEventDataJson("{}");
    setSeverity("info");
    setSource("ui");
    setPersist(false);
    setJsonError(null);
    setSuccess(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!validateJson(eventDataJson)) return;
    if (!eventType.trim() || !source.trim()) return;

    const data: EventCreate = {
      event_type: eventType.trim(),
      event_data: JSON.parse(eventDataJson),
      severity,
      source: source.trim(),
      persist,
    };

    try {
      await onSubmit(data);
      if (!isMountedRef.current) return;
      setSuccess(true);
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setSuccess(false);
        resetForm();
        onOpenChange(false);
      }, 1500);
    } catch {
      // error is handled by parent hook
    }
  }, [eventType, eventDataJson, severity, source, persist, validateJson, onSubmit, onOpenChange, resetForm]);

  const canSubmit = eventType.trim() && source.trim() && !jsonError && !creating;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {step === "edit" ? "Create Event" : "Preview & Confirm"}
          </DialogTitle>
          <DialogDescription>
            {step === "edit"
              ? "Compose an event to broadcast or persist to the database."
              : "Review the event before sending."}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="text-sm font-medium">
              Event {persist ? "persisted" : "broadcast"} successfully
            </p>
          </div>
        ) : step === "edit" ? (
          <div className="space-y-4">
            {/* Templates */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Template
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(EVENT_TEMPLATES).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleTemplateSelect(name)}
                    className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Event Type with autocomplete */}
            <div className="relative">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Event Type <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  value={eventType}
                  onChange={(e) => {
                    setEventType(e.target.value);
                    setShowTypeDropdown(true);
                  }}
                  onFocus={() => setShowTypeDropdown(true)}
                  onBlur={() => setTimeout(() => setShowTypeDropdown(false), 150)}
                  placeholder="e.g. model_loaded, system, error"
                  className="pr-8"
                />
                <ChevronDown className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              {showTypeDropdown && filteredTypes.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  <ScrollArea className="max-h-32">
                    <div className="p-1">
                      {filteredTypes.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setEventType(t);
                            setShowTypeDropdown(false);
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>

            {/* Severity */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Severity
              </label>
              <div className="flex gap-1.5">
                {SEVERITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeverity(opt.value)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      severity === opt.value
                        ? "border-primary bg-primary/10 font-medium"
                        : "hover:bg-accent"
                    }`}
                  >
                    <span className={opt.color}>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Source */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Source <span className="text-red-500">*</span>
              </label>
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. ui, resource_manager, tool_registry"
              />
            </div>

            {/* Event Data (JSON Editor) */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Event Data (JSON)
              </label>
              <textarea
                value={eventDataJson}
                onChange={(e) => {
                  setEventDataJson(e.target.value);
                  validateJson(e.target.value);
                }}
                className="w-full rounded-md border bg-muted/50 p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[100px]"
                rows={5}
                spellCheck={false}
              />
              {jsonError && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-red-500">
                  <AlertCircle className="h-3 w-3" />
                  {jsonError}
                </p>
              )}
            </div>

            {/* Persist Toggle */}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-xs font-medium">Persist to database</p>
                <p className="text-[11px] text-muted-foreground">
                  {persist
                    ? "Event will be saved and broadcast"
                    : "Event will be broadcast only (not saved)"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={persist}
                onClick={() => setPersist(!persist)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  persist ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    persist ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {error && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </p>
            )}
          </div>
        ) : (
          /* Preview Step */
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Type</span>
                <Badge variant="outline" className="text-[10px]">
                  {eventType}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Severity</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    SEVERITY_OPTIONS.find((s) => s.value === severity)?.color ?? ""
                  }`}
                >
                  {severity}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Source</span>
                <span className="text-xs">{source}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Mode</span>
                <Badge
                  variant={persist ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {persist ? "Persist + Broadcast" : "Broadcast Only"}
                </Badge>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs text-muted-foreground">
                Event Data
              </span>
              <pre className="rounded-md border bg-muted/50 p-3 text-[11px] font-mono overflow-x-auto max-h-40">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(eventDataJson), null, 2);
                  } catch {
                    return eventDataJson;
                  }
                })()}
              </pre>
            </div>
            {error && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </p>
            )}
          </div>
        )}

        {!success && (
          <DialogFooter className="gap-2">
            {step === "preview" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("edit")}
                  disabled={creating}
                >
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : persist ? (
                    <Save className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <Send className="mr-1 h-3.5 w-3.5" />
                  )}
                  {creating
                    ? "Sending..."
                    : persist
                      ? "Persist & Broadcast"
                      : "Broadcast"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => setStep("preview")}
                  disabled={!canSubmit}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  Preview
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
