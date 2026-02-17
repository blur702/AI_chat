"use client";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@workstation/ui";
import { Check, AlertTriangle, Link2 } from "lucide-react";
import type { TechnologyInfo } from "@workstation/api/types";

interface TechnologyCheckboxProps {
  technology: TechnologyInfo;
  selected: boolean;
  disabled: boolean;
  autoSelected: boolean;
  conflictReason?: string;
  onToggle: (techId: string) => void;
}

export function TechnologyCheckbox({
  technology,
  selected,
  disabled,
  autoSelected,
  conflictReason,
  onToggle,
}: TechnologyCheckboxProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled || autoSelected}
          onClick={() => onToggle(technology.id)}
          className={`relative w-full rounded-lg border-2 p-3 text-left transition-colors ${
            selected
              ? autoSelected
                ? "border-primary/50 bg-primary/5 opacity-80"
                : "border-primary bg-primary/5"
              : disabled
              ? "border-muted opacity-50 cursor-not-allowed"
              : "border-muted hover:border-primary/30"
          }`}
        >
          {selected && (
            <div className="absolute top-2 right-2">
              {autoSelected ? (
                <Link2 className="h-3.5 w-3.5 text-primary/60" />
              ) : (
                <Check className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
          )}
          {disabled && conflictReason && (
            <div className="absolute top-2 right-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </div>
          )}
          <div className="font-medium text-sm pr-5">{technology.name}</div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {technology.description}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] capitalize">
              {technology.category}
            </Badge>
            {technology.exposed_ports.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                Port {technology.exposed_ports.join(", ")}
              </Badge>
            )}
            {technology.sidecar_services.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                +{technology.sidecar_services.length} sidecar
                {technology.sidecar_services.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {conflictReason ? (
          <p className="text-xs">{conflictReason}</p>
        ) : autoSelected ? (
          <p className="text-xs">Auto-selected as dependency</p>
        ) : technology.requires_technologies.length > 0 ? (
          <p className="text-xs">
            Requires: {technology.requires_technologies.join(", ")}
          </p>
        ) : (
          <p className="text-xs">{technology.description}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
