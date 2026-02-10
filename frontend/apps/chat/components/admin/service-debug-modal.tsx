"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workstation/ui";
import { Check, Copy } from "lucide-react";
import type { ServiceDebugInfo } from "@workstation/api/types";

interface ServiceDebugModalProps {
  service: ServiceDebugInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceDebugModal({
  service,
  open,
  onOpenChange,
}: ServiceDebugModalProps) {
  const [copied, setCopied] = useState(false);

  if (!service) return null;

  const jsonText = JSON.stringify(service, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Service Debug: {service.service_name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={
                service.health_status ? "text-green-500" : "text-red-500"
              }
            >
              {service.health_status ? "Healthy" : "Unhealthy"}
            </span>
            <span className="text-muted-foreground">
              {service.health_message}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1.5" />
            )}
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        </div>

        <div className="flex-1 overflow-auto rounded-md bg-muted p-3">
          <pre className="text-xs font-mono whitespace-pre-wrap break-words">
            {jsonText}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
