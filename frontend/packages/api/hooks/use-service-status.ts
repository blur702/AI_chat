"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getClient } from "../client";
import type { KernelStatusResponse, ServiceDetail } from "../types";

/** Services that must be healthy for core chat functionality. */
const CRITICAL_SERVICES = ["ollama_client"] as const;

/** All services we display status for. */
const TRACKED_SERVICES = [
  "ollama_client",
  "comfyui_client",
  "embedding_service",
  "resource_manager",
] as const;

export type TrackedService = (typeof TRACKED_SERVICES)[number];

export interface ServiceStatus {
  name: TrackedService;
  label: string;
  detail: ServiceDetail | null;
}

export interface UseServiceStatusReturn {
  /** False when the backend cannot be reached at all. */
  backendReachable: boolean;
  /** True once critical services (Ollama) report healthy — chat is functional. */
  criticalServicesReady: boolean;
  /** True when every tracked service is healthy. */
  allServicesReady: boolean;
  /** Per-service health details for tracked services. */
  services: ServiceStatus[];
  /** Raw kernel status response (null until first successful fetch). */
  kernelStatus: KernelStatusResponse | null;
  /** Seconds since the first failed check (0 if backend is reachable). */
  unreachableDuration: number;
  /** Manually trigger a refresh. */
  refresh: () => void;
}

const SERVICE_LABELS: Record<TrackedService, string> = {
  ollama_client: "Ollama",
  comfyui_client: "ComfyUI",
  embedding_service: "Embeddings",
  resource_manager: "GPU Manager",
};

const POLL_FAST_MS = 4_000;
const POLL_SLOW_MS = 30_000;

export function useServiceStatus(): UseServiceStatusReturn {
  const [backendReachable, setBackendReachable] = useState(true);
  const [kernelStatus, setKernelStatus] = useState<KernelStatusResponse | null>(null);
  const [unreachableSince, setUnreachableSince] = useState<number | null>(null);
  const [unreachableDuration, setUnreachableDuration] = useState(0);
  const [criticalReady, setCriticalReady] = useState(false);
  const [allReady, setAllReady] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const status = await getClient().kernelStatus();
      if (!mountedRef.current) return;

      setBackendReachable(true);
      setUnreachableSince(null);
      setUnreachableDuration(0);
      setKernelStatus(status);

      // Check if critical services are all healthy
      const allCritical = CRITICAL_SERVICES.every((name) => {
        const svc = status.service_details[name];
        return svc?.healthy === true;
      });
      setCriticalReady(allCritical);

      // Check if every tracked service is healthy
      const every = TRACKED_SERVICES.every((name) => {
        const svc = status.service_details[name];
        return svc?.healthy === true;
      });
      setAllReady(every);
    } catch {
      if (!mountedRef.current) return;
      setBackendReachable(false);
      setCriticalReady(false);
      setAllReady(false);
      setUnreachableSince((prev) => prev ?? Date.now());
    }
  }, []);

  // Update unreachable duration ticker
  useEffect(() => {
    if (unreachableSince === null) return;
    const tick = setInterval(() => {
      setUnreachableDuration(Math.floor((Date.now() - unreachableSince) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [unreachableSince]);

  // Manage polling interval — fast while starting, slow once ready
  useEffect(() => {
    mountedRef.current = true;
    poll(); // initial fetch

    const ms = criticalReady ? POLL_SLOW_MS : POLL_FAST_MS;
    intervalRef.current = setInterval(poll, ms);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll, criticalReady]);

  const services: ServiceStatus[] = TRACKED_SERVICES.map((name) => ({
    name,
    label: SERVICE_LABELS[name],
    detail: kernelStatus?.service_details[name] ?? null,
  }));

  const refresh = useCallback(() => {
    poll();
  }, [poll]);

  return {
    backendReachable,
    criticalServicesReady: criticalReady,
    allServicesReady: allReady,
    services,
    kernelStatus,
    unreachableDuration,
    refresh,
  };
}
