"use client";

import { useCallback, useState } from "react";
import { extractErrorMessage } from "../utils/error";

interface UseAsyncActionOptions {
  /** Default error message when extraction fails */
  fallbackError?: string;
  /** Called on successful execution */
  onSuccess?: () => void;
  /** Called on error */
  onError?: (message: string) => void;
}

interface UseAsyncActionReturn<TArgs extends unknown[]> {
  execute: (...args: TArgs) => Promise<void>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useAsyncAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<void>,
  opts: UseAsyncActionOptions = {}
): UseAsyncActionReturn<TArgs> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: TArgs) => {
      setLoading(true);
      setError(null);
      try {
        await action(...args);
        opts.onSuccess?.();
      } catch (err: unknown) {
        const message = extractErrorMessage(err, opts.fallbackError);
        setError(message);
        opts.onError?.(message);
      } finally {
        setLoading(false);
      }
    },
    [action, opts]
  );

  const clearError = useCallback(() => setError(null), []);

  return { execute, loading, error, clearError };
}
