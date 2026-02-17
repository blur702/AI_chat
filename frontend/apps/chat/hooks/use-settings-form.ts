"use client";

import { useState, useCallback, useRef } from "react";

interface UseSettingsFormOptions<T extends Record<string, unknown>> {
  initialValues: T;
  onSave: (values: T) => Promise<{ success: boolean; error?: string }>;
  successMessage: string;
}

interface UseSettingsFormReturn<T extends Record<string, unknown>> {
  values: T;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  setValues: (next: T) => void;
  save: () => Promise<void>;
  saving: boolean;
  status: { text: string; type: "success" | "error" } | null;
  clearStatus: () => void;
}

export function useSettingsForm<T extends Record<string, unknown>>({
  initialValues,
  onSave,
  successMessage,
}: UseSettingsFormOptions<T>): UseSettingsFormReturn<T> {
  const [values, setValues] = useState<T>(initialValues);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const successMsgRef = useRef(successMessage);
  successMsgRef.current = successMessage;

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    setStatus(null);
    setSaving(true);
    try {
      const result = await onSaveRef.current(values);
      if (result.success) {
        setStatus({ text: successMsgRef.current, type: "success" });
      } else {
        setStatus({ text: result.error ?? "Failed to save", type: "error" });
      }
    } catch {
      setStatus({ text: "An unexpected error occurred", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [values]);

  const clearStatus = useCallback(() => setStatus(null), []);

  return { values, setField, setValues, save, saving, status, clearStatus };
}
