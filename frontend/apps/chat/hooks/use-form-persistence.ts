"use client";

import { useEffect, useMemo } from "react";

const STORAGE_KEY_PREFIX = "image-gen-form:";

export function useFormPersistence<T extends Record<string, unknown>>(
  projectId: string,
  form: T,
  setForm: (updater: (prev: T) => T) => void,
  defaults: Partial<T>
) {
  const storageKey = useMemo(
    () => `${STORAGE_KEY_PREFIX}${projectId}`,
    [projectId]
  );

  // Load from sessionStorage on mount / key change
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<T>;
        setForm((prev) => ({ ...prev, ...parsed }));
        return;
      }
    } catch {
      // ignore storage parse failures
    }
    if (Object.keys(defaults).length > 0) {
      setForm((prev) => ({ ...prev, ...defaults }));
    }
  }, [storageKey, defaults, setForm]);

  // Persist to sessionStorage on form change
  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(form));
  }, [form, storageKey]);

  const clear = () => sessionStorage.removeItem(storageKey);

  return { storageKey, clear };
}
