"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@workstation/ui";
import { HelpCircle } from "lucide-react";
import { useHelp } from "./help-provider";
import { t } from "@/lib/i18n";

interface FieldHelpProps {
  tip: string;
  slug?: string;
  className?: string;
}

export function FieldHelp({ tip, slug, className }: FieldHelpProps) {
  const { openHelp } = useHelp();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (slug) openHelp(slug);
          }}
          className={className ?? "inline-flex text-muted-foreground hover:text-foreground transition-colors"}
          aria-label={`Help: ${tip}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{tip}</p>
        {slug && (
          <button
            type="button"
            className="text-xs text-primary hover:underline mt-1 block"
            onClick={(e) => {
              e.stopPropagation();
              openHelp(slug);
            }}
          >
            {t("learnMore")}
          </button>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
