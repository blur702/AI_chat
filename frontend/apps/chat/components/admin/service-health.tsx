"use client";

import { useState, useCallback } from "react";
import { Badge, Button, cn, Skeleton } from "@workstation/ui";
import { Bug, CheckCircle2, XCircle } from "lucide-react";
import type { KernelDebugInfo, ServiceDebugInfo } from "@workstation/api/types";
import { ServiceDebugModal } from "./service-debug-modal";

interface ServiceHealthProps {
  debugInfo: KernelDebugInfo | null;
  getServiceDebug: (serviceName: string) => Promise<ServiceDebugInfo>;
}

export function ServiceHealth({
  debugInfo,
  getServiceDebug,
}: ServiceHealthProps) {
  const [selectedService, setSelectedService] =
    useState<ServiceDebugInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingService, setLoadingService] = useState<string | null>(null);

  const handleDebugClick = useCallback(
    async (serviceName: string) => {
      setLoadingService(serviceName);
      try {
        const detail = await getServiceDebug(serviceName);
        setSelectedService(detail);
        setModalOpen(true);
      } catch {
        // If per-service fetch fails, fall back to the debug info we have
        const fallback = debugInfo?.services[serviceName] ?? null;
        if (fallback) {
          setSelectedService(fallback);
          setModalOpen(true);
        }
      } finally {
        setLoadingService(null);
      }
    },
    [getServiceDebug, debugInfo]
  );

  if (!debugInfo) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Service Health</h3>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const services = Object.values(debugInfo.services);

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Service Health</h3>
        <div className="space-y-2">
          {services.map((svc) => (
            <div
              key={svc.service_name}
              className="flex items-center justify-between rounded-md border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {svc.health_status ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {svc.service_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {svc.health_message}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    svc.is_running
                      ? "text-green-600 border-green-500/30"
                      : "text-red-600 border-red-500/30"
                  )}
                >
                  {svc.is_running ? "Running" : "Stopped"}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDebugClick(svc.service_name)}
                  disabled={loadingService === svc.service_name}
                >
                  <Bug className="h-3.5 w-3.5 mr-1" />
                  Debug
                </Button>
              </div>
            </div>
          ))}

          {services.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No services registered.
            </p>
          )}
        </div>
      </div>

      <ServiceDebugModal
        service={selectedService}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
