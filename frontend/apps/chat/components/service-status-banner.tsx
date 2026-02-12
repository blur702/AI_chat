"use client";

import { useEffect, useState } from "react";
import { cn } from "@workstation/ui";
import { useServiceStatus } from "@workstation/api/hooks";
import { Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const FADE_DELAY_MS = 3_000;
const EXTENDED_FAILURE_SECS = 60;

export function ServiceStatusBanner() {
  const {
    backendReachable,
    criticalServicesReady,
    allServicesReady,
    services,
    unreachableDuration,
  } = useServiceStatus();

  const [dismissed, setDismissed] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  // Auto-dismiss when critical services are ready
  useEffect(() => {
    if (!criticalServicesReady) {
      setDismissed(false);
      setFadeOut(false);
      return;
    }
    const timer = setTimeout(() => setFadeOut(true), FADE_DELAY_MS);
    const hide = setTimeout(() => setDismissed(true), FADE_DELAY_MS + 500);
    return () => {
      clearTimeout(timer);
      clearTimeout(hide);
    };
  }, [criticalServicesReady]);

  // Don't render once dismissed and critical services are healthy
  if (dismissed && criticalServicesReady) return null;

  const extendedFailure = !backendReachable && unreachableDuration > EXTENDED_FAILURE_SECS;

  // Pick banner variant
  let bgClass: string;
  let icon: React.ReactNode;
  let label: string;

  if (!backendReachable) {
    if (extendedFailure) {
      bgClass = "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400";
      icon = <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
      label = `Backend unreachable (${unreachableDuration}s)`;
    } else {
      bgClass = "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400";
      icon = <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />;
      label = "Waiting for backend...";
    }
  } else if (allServicesReady) {
    bgClass = "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400";
    icon = <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
    label = "All services ready";
  } else if (criticalServicesReady) {
    bgClass = "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400";
    icon = <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
    label = "Ready";
  } else {
    bgClass = "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400";
    icon = null;
    label = "";
  }

  // Show per-service indicators when critical services are not ready yet
  const showPerService = backendReachable && !criticalServicesReady;

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b px-3 py-1.5 text-xs transition-opacity duration-500",
        bgClass,
        fadeOut && "opacity-0"
      )}
    >
      {!showPerService && (
        <>
          {icon}
          <span>{label}</span>
        </>
      )}

      {showPerService && (
        <>
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="mr-1">Services starting:</span>
          <div className="flex items-center gap-3">
            {services.map((svc) => {
              const healthy = svc.detail?.healthy === true;
              const running = svc.detail?.is_running === true;
              return (
                <span key={svc.name} className="flex items-center gap-1">
                  {healthy ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : running ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <XCircle className="h-3 w-3 text-muted-foreground/50" />
                  )}
                  <span className={cn(healthy && "text-green-600 dark:text-green-400")}>
                    {svc.label}
                  </span>
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
